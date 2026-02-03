import { ApexTradingService } from '#lib/apex-trading/apex-trading.service';
import { ShopifyService } from '#lib/shopify/shopify.service';
import { PaginatedResponse } from '#lib/apex-trading/types';
import { Step, Workflow } from '#lib/workflow/decorators';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { Batch } from '#lib/apex-trading/types/product';
import { ZohoService } from '#lib/zoho/zoho.service';
import { MongoService } from '#lib/core/services';
import { EnvService } from '#lib/core/env';
import { Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { keyBy } from 'lodash-es';
import readline from 'node:readline';

@Workflow({
  name: 'HBH - Apex Trading Inventory Sync',
  webhook: true,
  concurrency: 1,
  triggers: [
    cron('*/30 * * * *', {
      timezone: 'America/New_York', // Every 30 minutes
    }),
  ],
})
export class ApexTradingInventorySyncWorkflow extends WorkflowBase {
  constructor(
    private readonly apexTrading: ApexTradingService,
    private readonly zohoService: ZohoService,
    private readonly shopify: ShopifyService,
    private readonly envService: EnvService,
    private readonly mongo: MongoService,
  ) {
    super();
  }

  private logger = new Logger(ApexTradingInventorySyncWorkflow.name);
  private locationId = 'gid://shopify/Location/83996541085';
  private beginning = '2000-01-01T00:00:00Z';

  async getPrevTimestamp(): Promise<Date> {
    // const job = await this.getPrevJob();
    //
    // if (job) {
    //   return job.createdAt;
    // }

    return Promise.resolve(new Date(this.beginning));
  }

  @Step(1)
  validate() {
    if (!this.envService.isProd) {
      return this.cancel('Not running in development environment');
    }
  }

  @Step(2)
  async exportShopifyProducts() {
    const query = `#graphql
    query {
      productVariants(first: 10, query: "sku:EW_DM-*") {
        edges {
          node {
            inventoryItem {
              id
              sku
              inventoryLevel(locationId: "${this.locationId}") {
                quantities(names: ["on_hand"]) {
                  quantity
                }
              }
            }
          }
        }
      }
    }
    `;

    const bulkOperationRunQuery = await this.shopify.gql<{
      bulkOperation: BulkOperation;
    }>({
      connection: 'hbh_wholesale',
      root: 'bulkOperationRunQuery',
      variables: {
        query: query,
      },
      query: `#graphql
      mutation ($query: String!) {
        bulkOperationRunQuery(query: $query) {
          bulkOperation {
            id
            status
            url
            errorCode
          }
          userErrors {
            code
            field
            message
          }
        }
      }
      `,
    });

    if (bulkOperationRunQuery.userErrors?.length) {
      throw new Error(
        `Shopify GQL Error: ${bulkOperationRunQuery.userErrors
          .map((e) => e.message)
          .join(', ')}`,
      );
    }

    this.delay(5000);

    return bulkOperationRunQuery.bulkOperation;
  }

  @Step(3)
  async checkExportStatus() {
    const operation = await this.getResult<BulkOperation>(
      'exportShopifyProducts',
    );

    if (!operation) {
      throw new Error(`Bulk operation not found`);
    }

    const node = await this.shopify.gql<BulkOperation | null>({
      connection: 'hbh_wholesale',
      root: 'node',
      variables: {
        operationId: operation.id,
      },
      query: `#graphql
      query ($operationId: ID!) {
        node(id: $operationId) {
          ... on BulkOperation {
            id
            status
            url
            errorCode
          }
        }
      }
      `,
    });

    if (!node) {
      throw new Error(`Bulk operation not found`);
    }

    if (
      node.status === 'RUNNING' ||
      node.status === 'CREATED' ||
      node.status === 'CANCELING'
    ) {
      return this.rerun(5000); // Rerun after 5 seconds
    }

    if (
      node.status === 'FAILED' ||
      node.status === 'CANCELED' ||
      node.status === 'EXPIRED'
    ) {
      throw new Error(
        `Bulk operation failed with status ${node.status} and error code ${node.errorCode}`,
      );
    }

    return node;
  }

  @Step(4)
  async storeQtyInMongo() {
    const operation = await this.getResult<BulkOperation>('checkExportStatus');

    if (!operation?.url) {
      throw new Error(`No URL for bulk operation`);
    }

    const res = await axios.get(operation.url, {
      responseType: 'stream',
    });

    const rl = readline.createInterface({
      input: res.data as NodeJS.ReadableStream,
      crlfDelay: Infinity,
    });

    const queue: Variant[] = [];
    let timestamp = Date.now();

    for await (const line of rl) {
      queue.push(JSON.parse(line.trim()) as Variant);

      if (queue.length >= 300 || Date.now() - timestamp > 10000) {
        // Process in batches of 300 or every 10 seconds

        await this.mongo
          .db('hbh')
          .collection('apex_products')
          .bulkWrite(
            queue.map((v) => ({
              updateOne: {
                filter: { sku: v.inventoryItem.sku },
                update: {
                  $set: {
                    sku: v.inventoryItem.sku,
                    qty:
                      v.inventoryItem.inventoryLevel?.quantities[0].quantity ||
                      0,
                  },
                },
                upsert: true,
              },
            })),
          );

        queue.length = 0;
        timestamp = Date.now();

        await new Promise((r) => setTimeout(r, 1000)); // Avoid rate limits
      }
    }
  }

  @Step(5)
  async execute() {
    const items = await this.mongo
      .db('hbh')
      .collection<Item>('apex_products')
      .find()
      .toArray();

    const itemsBySku = keyBy(items, 'sku');

    const timestamp = await this.getPrevTimestamp();

    const results: Record<string, any>[] = [];

    for (let page = 1; ; page++) {
      const { data } = await this.apexTrading.get<
        PaginatedResponse<{ batches: Batch[] }>
      >(
        `/v2/batches?page=${page}&per_page=200&updated_at_from=${timestamp.toISOString()}`,
        {
          connection: 'dispomart',
        },
      );

      this.logger.log(
        `Fetched page ${page} with ${data.batches.length} batches`,
      );

      for (const batch of data.batches) {
        const item = itemsBySku[`EW_DM-${batch.name}`];

        if (!item) {
          continue;
        }

        try {
          await this.apexTrading.patch(
            `/v2/batches/${batch.id}`,
            {
              quantity: Math.max(0, Number(item.qty) || 0),
            },
            {
              connection: 'dispomart',
            },
          );

          results.push({
            sku: batch.name,
            batchId: batch.id,
            quantity: item.qty,
          });
        } catch (e) {
          if (e instanceof AxiosError) {
            this.logger.error(
              `Failed to update batch ${batch.id} for SKU EW_DM-${batch.name}: ${e.response?.data}`,
            );
          }

          results.push({
            sku: batch.name,
            batchId: batch.id,
            error: e instanceof Error ? e.message : 'Unknown error',
          });
        }
      }

      if (data.meta.last_page <= page) {
        break;
      }
    }

    return results;
  }
}

interface Item {
  sku: string;
  qty: number;
}

interface BulkOperation {
  id: string;
  status: string;
  url?: string;
  errorCode: string | null;
}

interface Variant {
  inventoryItem: {
    id: string;
    sku: string;
    inventoryLevel: {
      quantities: {
        quantity: number;
      }[];
    } | null;
  };
}

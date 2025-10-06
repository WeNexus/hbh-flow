import { FujimausaService } from '#lib/fujimausa/fujimausa.service';
import { ShopifyService } from '#lib/shopify/shopify.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import * as readline from 'node:readline';
import { Logger } from '@nestjs/common';
import { keyBy } from 'lodash-es';
import axios from 'axios';

@Workflow({
  name: 'HBH - Sync Shopify Wholesale with East West',
  webhook: true,
  concurrency: 1,
  triggers: [
    cron('*/30 * * * *', {
      timezone: 'America/New_York', // Every 30 minutes
    }),
  ],
})
export class EastWestInventorySync extends WorkflowBase {
  constructor(
    private readonly fujimausaService: FujimausaService,
    private readonly shopifyService: ShopifyService,
    private readonly envService: EnvService,
  ) {
    super();
  }

  private logger = new Logger(EastWestInventorySync.name);
  private locationId = 'gid://shopify/Location/38654869548';

  @Step(1)
  async exportShopifyProducts() {
    if (!this.envService.isProd) {
      return this.cancel('Not running in development environment');
    }

    const query = `#graphql
    query {
      productVariants(first: 10, query: "sku:EW_DM-*") {
        edges {
          node {
            sku
            inventoryItem {
              id
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

    const bulkOperationRunQuery = await this.shopifyService.gql<{
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

  @Step(2)
  async checkExportStatus() {
    const operation = await this.getResult<BulkOperation>(
      'exportShopifyProducts',
    );

    if (!operation) {
      throw new Error(`Bulk operation not found`);
    }

    const node = await this.shopifyService.gql<BulkOperation | null>({
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

  @Step(3)
  async updateShopify() {
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

    const mutation = `#graphql
    mutation ($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        userErrors {
          code
          field
          message
        }
      }
    }
    `;

    const queue: Variant[] = [];
    let timestamp = Date.now();

    for await (const line of rl) {
      queue.push(JSON.parse(line.trim()) as Variant);

      if (queue.length >= 40 || Date.now() - timestamp > 3000) {
        // Process in batches of 40 or every 3 seconds

        const variantsBySKU = keyBy(queue, 'sku');
        const skus = Object.keys(variantsBySKU).map((sku) =>
          sku.replace('EW_DM-', ''),
        );
        const stocks = await this.fujimausaService.getUnitOnHand(skus);

        const quantities = stocks.map((stock) => {
          const variant = variantsBySKU[`EW_DM-${stock.ProdCode}`];

          if (!variant) {
            return null;
          }

          return {
            locationId: this.locationId,
            inventoryItemId: variant.inventoryItem.id,
            compareQuantity:
              variant.inventoryItem.inventoryLevel.quantities[0].quantity,
            quantity: stock.UnitOnHand,
          };
        });

        try {
          await this.shopifyService.gql<Record<string, any>>({
            connection: 'hbh_wholesale',
            root: 'inventorySetQuantities',
            variables: {
              input: {
                name: 'on_hand',
                reason: 'correction',
                quantities: quantities.filter((v) => v !== null),
              },
            },
            query: mutation,
          });
        } catch (e: unknown) {
          this.logger.error('Error updating inventory', e);
        }

        queue.length = 0;
        timestamp = Date.now();

        await new Promise((r) => setTimeout(r, 1000)); // Avoid rate limits
      }
    }
  }
}

interface BulkOperation {
  id: string;
  status: string;
  url?: string;
  errorCode: string | null;
}

interface Variant {
  sku: string;
  inventoryItem: {
    id: string;
    inventoryLevel: {
      quantities: {
        quantity: number;
      }[];
    };
  };
}

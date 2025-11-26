import { WoocommerceService } from '#lib/woocommerce/woocommerce.service';
import { ShopifyService } from '#lib/shopify/shopify.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import type { Products } from 'woocommerce-rest-ts-api';
import { keyBy, difference } from 'lodash-es';
import { EnvService } from '#lib/core/env';
import * as readline from 'node:readline';
import { Logger } from '@nestjs/common';
import axios from 'axios';

@Workflow({
  name: 'HBH - Sync retail product stock with Ryot',
  webhook: true,
  concurrency: 1,
  triggers: [
    cron('*/30 * * * *', {
      timezone: 'America/New_York', // Every 30 minutes
    }),
  ],
})
export class RyotInventorySyncWorkflow extends WorkflowBase {
  constructor(
    private readonly wooService: WoocommerceService,
    private readonly shopifyService: ShopifyService,
    private readonly env: EnvService,
  ) {
    super();
  }

  private logger = new Logger(RyotInventorySyncWorkflow.name);
  private locationId = 'gid://shopify/Location/10155275';

  @Step(1)
  async exportShopifyProducts() {
    if (!this.env.isProd) {
      return this.cancel('Not running in development environment');
    }

    const query = `#graphql
    query {
      productVariants(first: 10, query: "vendor:Ryot") {
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
      connection: 'hbh_retail',
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
            partialDataUrl
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
      connection: 'hbh_retail',
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
            partialDataUrl
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
      node.status === 'CANCELING' ||
      !node.url
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

    const wcTokens = this.wooService.getToken('ryot');

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
        inventoryAdjustmentGroup {
          reason
          changes {
            name
            delta
            quantityAfterChange
            item {
              sku
            }
          }
        }
      }
    }
    `;

    let timestamp = Date.now();
    const queue: Variant[] = [];
    const loaded: string[] = [];
    const updated: string[] = [];
    const missing: string[] = [];
    const failed: string[] = [];

    for await (const line of rl) {
      const variant = JSON.parse(line.trim()) as Variant;
      queue.push(variant);
      loaded.push(variant.sku);

      if (queue.length >= 20 || Date.now() - timestamp > 3000) {
        // Process in batches of 20 or every 3 seconds

        const variantsBySKU = keyBy(queue, 'sku');
        const skus = Object.keys(variantsBySKU);

        const url = new URL(wcTokens.storeUrl);
        url.pathname = '/wp-json/wc/v3/products';
        url.searchParams.set('sku', skus.join(','));
        url.searchParams.set('per_page', skus.length.toString());

        const { data: wooProducts } = await axios.get<Products[]>(
          url.toString(),
          {
            auth: {
              username: wcTokens.consumerKey,
              password: wcTokens.consumerSecret,
            },
          },
        );

        this.logger.log(wooProducts);

        const wooSKUs = wooProducts.map((p) => p.sku);
        const missingSKUs = difference(skus, wooSKUs);

        missing.push(...missingSKUs);

        const quantities = wooProducts.map((wooProduct) => {
          const variant = variantsBySKU[wooProduct.sku];

          if (!variant) {
            return null;
          }

          return {
            locationId: this.locationId,
            inventoryItemId: variant.inventoryItem.id,
            compareQuantity:
              variant.inventoryItem.inventoryLevel.quantities[0].quantity,
            quantity: Math.max(wooProduct.stock_quantity, 0),
          };
        });

        try {
          await this.shopifyService.gql<Record<string, any>>({
            connection: 'hbh_retail',
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
          updated.push(...wooSKUs);
        } catch (e: unknown) {
          this.logger.error('Error updating inventory', e);
          failed.push(...wooSKUs);
        }

        queue.length = 0;
        timestamp = Date.now();

        await new Promise((r) => setTimeout(r, 1000)); // Avoid rate limits
      }
    }

    this.logger.log(
      `Inventory sync completed: ${loaded.length} loaded, ${updated.length} updated, ${missing.length} missing, ${failed.length} failed.`,
    );

    return { loaded, updated, missing, failed };
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

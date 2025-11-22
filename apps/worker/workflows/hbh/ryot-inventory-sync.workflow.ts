import { WoocommerceService } from '#lib/woocommerce/woocommerce.service';
import { ShopifyService } from '#lib/shopify/shopify.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import * as readline from 'node:readline';
import { Logger } from '@nestjs/common';
import { keyBy } from 'lodash-es';
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
    private readonly envService: EnvService,
  ) {
    super();
  }

  private logger = new Logger(RyotInventorySyncWorkflow.name);
  private locationId = 'gid://shopify/Location/10155275';
  private skus = [
    '1905-FLY',
    '1905-SL',
    'SK-BLK-M4-15',
    'SK-M4-22',
    'T-CIG1-DIG-ANO-BLU',
    'T-CIG1-ANO-BLU',
    'T-CIG1-DIG-ANO-GM',
    'T-CIG1-ANO-GM',
    'T-CIG1-DIG-ANO-RSG',
    'T-CIG1-ANO-RSG',
    'T-CIG1-DIG-ANO-SIL',
    'T-CIG1-ANO-SIL',
    'T-CIG1-DIG-ANO-BLK',
    'T-CIG1-ANO-BLK',
    'T-CIG1-DIG-ANO-GRN',
    'T-CIG1-ANO-GRN',
    '1905-CHR',
    'SSC-AWSB-L-BLK-RL',
    'SSC-AWSB-S-BLK',
    'SS-HCP-S-CAMO',
    'SS-HCP-S-TAN',
    'SS-HCP-L-BLK',
    'SS-HCP-L-OLIVE',
    'RHH-8X11-WL-D',
    'SSO-RLW-BLK',
    'SSO-RLW-CAMO',
    'SSO-RLW-L-NAT',
    'SSO-RLW-L-OLIVE',
    'VERB-710-COIL-3PK',
    'VERB-710-CONV',
    'CR-MSP-BK',
    'SSC-SAYF-L-BLK-RL',
    'SSC-SAYF-L-OLV-RL',
    'SSC-SAYF-L-CAMO-RL',
    'GR-SUS-BK',
    'VERB-510-BLK',
    'VERB-510-BG',
    'VERB-510-GRN',
    'VERB-510-NS',
    'VERB-510-TAN',
    'VERB-510-TD',
    'VERB-710-WHT',
    'VERB-710-BLK',
    'VERB-710-GLD',
    'RJW-GR8-BKWL',
    'RJW-GR8-CLWL',
    'RJW-GR8-BKBL',
    'RJW-GR8-CLBL',
    'MPB-AC-CLR-SR',
    'MPB-AC-BW-SR',
    'MPB-AC-GRN-SR',
    'MPB-AC-PW-SR',
    'MPB-AC-RB-SR',
    'SS-KK-BLK',
    'SS-KK-BLK-GR',
    'SS-KK-CAMO',
    'SS-KK-NAT',
    'SS-KK-OLIVE',
    'GR-BS-BK',
    'SKJ-BLK-M4-22',
    'SKJ-BLK-M4-25',
    'SKJ-GM-M4-22',
    'SKJ-GM-M4-25',
    'SKJ-RSG-M4-22',
    'SKJ-RSG-M4-25',
    'SKJ-M4-22',
    'SKJ-M4-25',
    'SK-BLK-M4-22',
    'SK-BLK-M4-25',
    'SK-GM-M4-22',
    'SK-GM-M4-25',
    'SK-RSG-M4-25',
    'MPB-AL-BSL-SR',
    'MPB-AL-CSL-SR',
    'MPB-AL-GSL-SR',
    'MPB-AL-PSL-SR',
    'MPB-AL-SSL-SR',
    'MPB-AL-WSL-SR',
    'CR-RTV-BK',
    'JR-CL-BL-WP',
    'SK2J-GR8-BLK',
    'SK2J-GR8-SGM',
    'SK2J-GR8-RSG',
    'SK2S-GR8-BLK',
    'SK2S-GR8-SGM',
    'SK2S-GR8-RSG',
    'SKSCRN-15-6M',
    'SKSCRN-22-6M',
    'SKSCRN-25-6M',
    'SK-PPZ-14',
    'RDB-WL-L',
    'SSC-RPR-M-BLK',
    'SSC-RPR-S-BLK',
    'SSC-RPR-M-OLIVE',
    'SSC-RPR-S-OLIVE',
    'SSC-RPR-M-TAN',
    'SSC-DF16-BLK-RL',
    'SSC-DF20-BLK-RL',
    'SSC-DF16-CAMO-RL',
    'PK',
    'PK-S',
    'PK-DAB',
    'VERB-510-ADK',
    'VERB-DHV-BLK',
    'VERB-DHV-RMP',
    'VERB-DHV-PKR',
    'VERB-DHV-TUK',
    'TRAY-SWL',
    'MPB-BB-SR',
    'MPB-MAP-SR',
    'MPB-RW-SR',
    'MPB-WAL-SR',
    'MPB-BLK-SR',
    'T-RGWB-12M-BCH',
    'T-RGWB-12M-WL',
    'T-RCGH-AC-PW',
    'T-RCGH-AC-RB',
    'T-RCGH-AC-BW',
    'T-RCGH-AC-BLU',
    'T-RCGH-AC-GRN',
    'T-RCGH-AC-SABK',
    'W7X7-NF',
    'W3X5-SL-WAL',
    'W4X7-WL',
  ];

  @Step(1)
  async exportShopifyProducts() {
    if (!this.envService.isProd) {
      return this.cancel('Not running in development environment');
    }

    const skuFilter = this.skus.map((sku) => `sku:${sku}`).join(' OR ');

    const query = `#graphql
    query {
      productVariants(first: 10, query: "${skuFilter}") {
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
    const woo = this.wooService.getClient('ryot');

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

      if (queue.length >= 20 || Date.now() - timestamp > 3000) {
        // Process in batches of 20 or every 3 seconds

        const variantsBySKU = keyBy(queue, 'sku');
        const skus = Object.keys(variantsBySKU);
        const { data: wooProducts } = await woo.getProducts({
          sku: skus.join(','),
        });

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
            quantity: wooProduct.stock_quantity,
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

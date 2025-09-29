import { BigCommerceService } from '#lib/bigcommerce/bigcommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import mongodb from 'mongodb';

const MongoClient = mongodb.MongoClient;

@Workflow({
  webhook: true,
  triggers: [
    cron('*/30 * * * *', {
      timezone: 'America/New_York', // Every 30 minutes
    }),
  ],
})
export class CacheBigcommerceProductsWorkflow extends WorkflowBase {
  constructor(
    private readonly bigCommerceService: BigCommerceService,
    private readonly envService: EnvService,
  ) {
    super();
  }

  @Step(1)
  async execute() {
    if (!this.envService.isProd) {
      return;
    }

    const channels = ['hbh', 'dispomart'];

    const groups = await Promise.all(
      channels.map(async (channel) => {
        const products = [];
        const variants = [];

        for (let i = 1; ; i++) {
          const {
            data: { data, meta },
          } = await this.bigCommerceService.get('/v3/catalog/products', {
            connection: channel,
            params: {
              limit: 250,
              page: i,
            },
          });

          products.push(
            ...data.map((p) => {
              const item = {
                id: p.id,
                weight: p.weight,
                stock: p.inventory_level,
              };

              if (p.sku) {
                item.sku = p.sku;
              }

              return item;
            }),
          );

          if (products.length >= meta.pagination.total) {
            break;
          }
        }

        for (let i = 1; ; i++) {
          const {
            data: { data, meta },
          } = await this.bigCommerceService.get(`/v3/catalog/variants`, {
            connection: channel,
            params: {
              limit: 250,
              page: i,
            },
          });

          variants.push(
            ...data.map((v) => {
              const item = {
                id: v.id,
                productId: v.product_id,
                weight: v.weight,
                stock: v.inventory_level,
              };

              if (v.sku) {
                item.sku = v.sku;
              }

              return item;
            }),
          );

          if (variants.length >= meta.pagination.total) {
            break;
          }
        }

        return {
          channel,
          products,
          variants,
        };
      }),
    );

    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const results = await Promise.all(
      groups.map(async ({ channel, products, variants }) => {
        const db = client.db(channel);

        const productDeleteResult = await db
          .collection('bigcommerce_product')
          .deleteMany({
            id: {
              $nin: products.map((p) => p.id),
            },
          });

        const variantsDeleteResult = await db
          .collection('bigcommerce_variant')
          .deleteMany({
            id: {
              $nin: variants.map((v) => v.id),
            },
          });

        const productUpsertResult = await db
          .collection('bigcommerce_product')
          .bulkWrite(
            products.map((p) => ({
              replaceOne: {
                filter: { id: p.id },
                replacement: p,
                upsert: true,
              },
            })),
          );

        const variantUpsertResult = await db
          .collection('bigcommerce_variant')
          .bulkWrite(
            variants.map((v) => ({
              replaceOne: {
                filter: { id: v.id },
                replacement: v,
                upsert: true,
              },
            })),
          );

        return {
          productUpsertResult,
          variantUpsertResult,
          productDeleteResult,
          variantsDeleteResult,
        };
      }),
    );

    await client.close();

    return results;
  }
}

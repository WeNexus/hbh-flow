import { BigCommerceService } from '#lib/bigcommerce/bigcommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { ZohoService } from '#lib/zoho/zoho.service';
import { safeJsonStringify } from '#lib/core/misc';
import { EnvService } from '#lib/core/env';
import { chunk, keyBy } from 'lodash-es';
import mongodb from 'mongodb';

const MongoClient = mongodb.MongoClient;

@Workflow({
  name: 'HBH - BigCommerce Inventory Sync',
  webhook: true,
  concurrency: 1,
  triggers: [
    cron('*/30 * * * *', {
      timezone: 'America/New_York', // Every 30 minutes
    }),
  ],
})
export class BigCommerceInventorySyncWorkflow extends WorkflowBase {
  constructor(
    private readonly bigCommerceService: BigCommerceService,
    private readonly zohoService: ZohoService,
    private readonly envService: EnvService,
  ) {
    super();
  }

  @Step(1)
  async fetchInventorySummary() {
    if (!this.envService.isProd) {
      return this.cancel('Not running in development environment');
    }

    const data: any = [];

    let page = 1;

    while (true) {
      const res = await this.zohoService.get<Record<string, any>>(
        `/inventory/v1/reports/inventorysummary?accept=json&page=${page}&per_page=5000&sort_order=A&sort_column=item_name&filter_by=TransactionDate.Today&group_by=%5B%7B%22field%22%3A%22none%22%2C%22group%22%3A%22report%22%7D%5D&show_actual_stock=true&rule=%7B%22columns%22%3A%5B%7B%22index%22%3A1%2C%22field%22%3A%22location_name%22%2C%22value%22%3A%5B%223195387000000083052%22%5D%2C%22comparator%22%3A%22in%22%2C%22group%22%3A%22report%22%7D%5D%2C%22criteria_string%22%3A%221%22%7D&select_columns=%5B%7B%22field%22%3A%22item_name%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22sku%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22quantity_available%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22quantity_available_for_sale%22%2C%22group%22%3A%22report%22%7D%5D&usestate=true&show_sub_categories=false&response_option=1&x-zb-source=zbclient&formatneeded=true&paper_size=A4&orientation=portrait&font_family_for_body=opensans&margin_top=0.7&margin_bottom=0.7&margin_left=0.55&margin_right=0.2&table_size=classic&table_style=alternative_columns&show_org_name=true&show_generated_date=true&show_generated_time=false&show_page_number=true&show_report_basis=true&show_generated_by=true&can_fit_to_page=true&watermark_opacity=50&show_org_logo_in_header=false&show_org_logo_as_watermark=false&watermark_position=center+center&watermark_zoom=50&file_name=Inventory+Summary&organization_id=776003162&frameorigin=https%3A%2F%2Finventory.zoho.com`,
        {
          connection: 'hbh',
        },
      );

      data.push(...res.data.inventory[0].item_details);

      if (res.data.page_context.has_more_page) {
        page += 1;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } else {
        break;
      }
    }

    return data as Record<string, any>[];
  }

  @Step(2)
  async fetchInventoryItems() {
    const summary = await this.getResult('fetchInventorySummary');

    const params = encodeURIComponent(
      JSON.stringify({
        responseFormat: 'json',
        selectedColumns: ['Item ID', 'SKU', 'Item Name', 'Status'],
      }),
    );

    const { data } = await this.zohoService.get(
      `/restapi/v2/workspaces/2556056000000249007/views/2556056000000249116/data?CONFIG=${params}`,
      {
        connection: 'hbh',
        baseURL: 'https://analyticsapi.zoho.com',
        headers: {
          'ZANALYTICS-ORGID': '776004901',
        },
      },
    );

    return data.data
      .filter(
        (i) =>
          i.Status === 'Active' &&
          i.SKU &&
          !summary.some((s) => s.sku === i.SKU),
      )
      .map((i) => ({
        id: i['Item ID'],
        sku: i.SKU,
        name: i['Item Name'],
      }));
  }

  @Step(3)
  async fetchMongoItems() {
    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const dispomart = client.db('dispomart');
    const hbh = client.db('hbh');

    const result = {
      items: await hbh.collection('item').find().toArray(),
      hbh: {
        products: await hbh.collection('bigcommerce_variant').find().toArray(),
        variants: await hbh
          .collection('bigcommerce_product')
          .find({
            sku: { $exists: true },
          })
          .toArray(),
      },
      dispomart: {
        products: await dispomart
          .collection('bigcommerce_variant')
          .find()
          .toArray(),
        variants: await dispomart
          .collection('bigcommerce_product')
          .find({
            sku: { $exists: true },
          })
          .toArray(),
      },
    };

    await client.close();

    return result;
  }

  @Step(4)
  async insertInventoryItems() {
    const { items } = await this.getResult('fetchMongoItems');
    const summary = await this.getResult('fetchInventorySummary');
    const allItems = await this.getResult('fetchInventoryItems');

    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const hbh = client.db('hbh');

    const itemsToInsert = summary
      .filter((si) => si.sku && !items.some((i) => i.id === si.item_id))
      .map((si) => ({
        id: si.item_id,
        sku: si.sku,
        name: si.item_name,
        stock: Math.round(si.quantity_available_for_sale),
      }))
      .concat(
        allItems
          .filter((ai) => ai.sku && !items.some((i) => i.id === ai.id))
          .map((i) => ({
            id: i.id,
            sku: i.sku,
            name: i.name,
          })),
      );

    let mongoItemInsertResult = null;

    if (itemsToInsert.length > 0) {
      mongoItemInsertResult = await hbh
        .collection('item')
        .bulkWrite(
          itemsToInsert.map((i) => ({
            updateOne: {
              filter: {
                $or: [{ id: i.id }, { sku: i.sku }],
              },
              update: {
                $set: i,
              },
              upsert: true,
            },
          })),
        )
        .then((r) => ({
          deleted: r.deletedCount,
          inserted: r.upsertedCount,
          modified: r.modifiedCount,
          upsertedIds: r.upsertedIds,
          matched: r.matchedCount,
        }));
    }

    await client.close();

    return mongoItemInsertResult;
  }

  @Step(5)
  async getChangedItems() {
    const { hbh, dispomart, items } = await this.getResult('fetchMongoItems');
    const summary = await this.getResult('fetchInventorySummary');

    return [hbh, dispomart].map((c) => {
      const summaryBySKUs = keyBy(summary, 'sku');
      const productsBySKUs = keyBy(c.products, 'sku');
      const variantsBySKUs = keyBy(c.variants, 'sku');

      const bigCommerceSKUs = new Set(
        Object.keys(productsBySKUs).concat(Object.keys(variantsBySKUs)),
      );

      return items
        .map((item) => {
          const summaryItem = summaryBySKUs[item.sku];

          if (!summaryItem || !bigCommerceSKUs.has(item.sku)) {
            return null;
          }

          const variant = variantsBySKUs[item.sku];
          const product = productsBySKUs[item.sku];
          const bigCommerceItem = variant || product;
          const qtyAvailable = Math.round(
            summaryItem.quantity_available_for_sale,
          );

          if (bigCommerceItem.stock === qtyAvailable) {
            return null;
          }

          item.stock = bigCommerceItem.stock = qtyAvailable;

          return {
            item: item,
            variant,
            product: variant ? null : product,
          };
        })
        .filter((i) => !!i);
    });
  }

  @Step(6)
  async updateBigCommerce() {
    const changes = await this.getResult('getChangedItems');

    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const results = await Promise.all(
      changes.map(async (items, index) => {
        if (items.length <= 0) {
          return null;
        }

        const channel = index === 0 ? 'hbh' : 'dispomart';
        const db = client.db(channel);

        const mongoItemUpsertResult = await client
          .db('hbh')
          .collection('item')
          .bulkWrite(
            items.map(({ item }) => ({
              updateOne: {
                filter: { sku: item.sku },
                update: { $set: { stock: item.stock } },
              },
            })),
          );

        const variants = items.map((i) => i.variant).filter((i) => !!i);
        const products = items.map((i) => i.product).filter((i) => !!i);

        let mongoVariantUpsertResult = null;
        let mongoProductUpsertResult = null;

        if (products.length > 0) {
          mongoProductUpsertResult = await db
            .collection('bigcommerce_product')
            .bulkWrite(
              products.map((p) => ({
                updateOne: {
                  filter: { sku: p.sku },
                  update: { $set: { stock: p.stock } },
                  upsert: true,
                },
              })),
            )
            .then((r) => ({
              deleted: r.deletedCount,
              inserted: r.upsertedCount,
              modified: r.modifiedCount,
              upsertedIds: r.upsertedIds,
              matched: r.matchedCount,
            }));
        }

        if (variants.length > 0) {
          mongoVariantUpsertResult = await db
            .collection('bigcommerce_variant')
            .bulkWrite(
              variants.map((v) => ({
                updateOne: {
                  filter: { sku: v.sku },
                  update: { $set: { stock: v.stock } },
                  upsert: true,
                },
              })),
            )
            .then((r) => ({
              deleted: r.deletedCount,
              inserted: r.upsertedCount,
              modified: r.modifiedCount,
              upsertedIds: r.upsertedIds,
              matched: r.matchedCount,
            }));
        }

        const adjustmentResults = [];
        const chunks = chunk(items, 500);

        for (const chunk of chunks) {
          const adjustmentResult = await this.bigCommerceService.put(
            '/v3/inventory/adjustments/absolute',
            {
              reason: 'Scheduled updates from Zoho Inventory',
              items: chunk.map(({ item }) => ({
                location_id: 1,
                sku: item.sku,
                quantity: Number(item.stock) <= 0 ? 0 : Number(item.stock),
              })),
            },
            {
              connection: channel,
            },
          );

          adjustmentResults.push(adjustmentResult.data);
        }

        return {
          mongoProductUpsertResult,
          mongoVariantUpsertResult,
          mongoItemUpsertResult,
          adjustmentResults,
        };
      }),
    );

    await client.close();

    return JSON.parse(safeJsonStringify(results));
  }
}

import { BigCommerceService } from '#lib/bigcommerce/bigcommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import { chunk, keyBy } from 'lodash-es';
import mongodb from 'mongodb';

const MongoClient = mongodb.MongoClient;

@Workflow({
  webhook: true,
  name: 'Push Inventory Adjustment to BigCommerce',
})
export class PushInventoryAdjustmentWorkflow extends WorkflowBase {
  constructor(
    private readonly bigCommerceService: BigCommerceService,
    private readonly zohoService: ZohoService,
    private readonly envService: EnvService,
  ) {
    super();
  }

  @Step(1)
  async fetchItems() {
    const allIds = this.payload.inventory_adjustment.line_items
      .filter((i) => i.location_id == '3195387000000083052')
      .map((i) => i.item_id);

    if (allIds.length === 0) {
      return this.cancel('No items to update');
    }

    const idChunks = chunk(allIds, 200);
    const items = [];

    for (const ids of idChunks) {
      const { data: result } = await this.zohoService.get(
        `/inventory/v1/itemdetails?item_ids=${ids}`,
        {
          connection: 'hbh',
          params: {
            organization_id: '776003162',
          },
        },
      );

      items.push(...result.items.filter((i) => !!i.sku));

      if (idChunks.length > 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return items.reduce((a, b) => {
      a[b.sku] = b;
      return a;
    }, {});
  }

  @Step(2)
  async getUpdates() {
    const items = await this.getResult('fetchItems');
    const skus = Object.keys(items);

    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const db = client.db('hbh');

    const products = keyBy(
      await db
        .collection('bigcommerce_product')
        .find({
          sku: {
            $in: skus,
          },
        })
        .toArray(),
      'sku',
    );

    const variants = keyBy(
      await db
        .collection('bigcommerce_variant')
        .find({
          sku: {
            $in: skus,
          },
        })
        .toArray(),
      'sku',
    );

    await client.close();

    const updates = [];

    for (const item of Object.values(items)) {
      const bigcommerceItem = variants[item.sku] ?? products[item.sku];
      const newStock = Math.max(item.actual_available_for_sale_stock, 0);

      if (!bigcommerceItem) {
        continue;
      }

      if (bigcommerceItem.inventory_level === newStock) {
        continue;
      }

      updates.push({
        location_id: 1,
        sku: item.sku,
        quantity: newStock,
      });
    }

    if (updates.length === 0) {
      return this.cancel('No update to push');
    }

    return updates;
  }

  @Step(3)
  async pushToBigCommerce() {
    const updateChunks = chunk(await this.getResult('getUpdates'), 50);
    const results = [];

    for (const updates of updateChunks) {
      const { data } = await this.bigCommerceService.put(
        `/v3/inventory/adjustments/absolute`,
        {
          reason: steps.trigger.event.inventory_adjustment.reason,
          items: updates,
        },
        {
          connection: 'hbh',
        },
      );

      results.push(data);
    }

    return results;
  }
}

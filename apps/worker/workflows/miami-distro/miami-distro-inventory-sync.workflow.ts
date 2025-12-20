import { WoocommerceService } from '#lib/woocommerce/woocommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { ZohoService } from '#lib/zoho/zoho.service';
import { MongoService } from '#lib/core/services';
import { EnvService } from '#lib/core/env';
import { Logger } from '@nestjs/common';
import { chunk } from 'lodash-es';
import { WithId } from 'mongodb';

@Workflow({
  name: 'Miami Distro - Inventory Sync',
  webhook: true,
  concurrency: 1,
  triggers: [
    cron('0 */2 * * *', {
      // Every 60 minutes
      timezone: 'America/New_York',
      oldPattern: '*/60 * * * *',
    }),
  ],
})
export class MiamiDistroInventorySyncWorkflow extends WorkflowBase {
  constructor(
    private readonly wooService: WoocommerceService,
    private readonly zohoService: ZohoService,
    private readonly envService: EnvService,
    private readonly mongo: MongoService,
  ) {
    super();
  }

  private logger = new Logger(MiamiDistroInventorySyncWorkflow.name);

  @Step(1)
  async fetchInventorySummary() {
    if (!this.envService.isProd) {
      return this.cancel('Not running in development environment');
    }

    const itemDetails: Record<string, any>[] = [];

    const rule: Record<string, any> = {
      columns: [
        {
          index: 1,
          field: 'location_name',
          value: ['6673885000000093096'],
          comparator: 'in',
          group: 'branch',
        },
      ],
      criteria_string: '1',
    };

    if (this.payload?.sku) {
      rule.columns.push({
        index: 1,
        field: 'sku',
        value: this.payload.sku,
        comparator: 'equal',
        group: 'report',
      });

      rule.criteria_string = '( 1 AND 2 )';
    }

    for (let page = 1; ; page++) {
      const searchParams = new URLSearchParams({
        page: page.toString(),
        per_page: '5000',
        sort_order: 'A',
        sort_column: 'item_name',
        filter_by: 'TransactionDate.Today',
        stock_on_hand_filter: 'All',
        group_by: JSON.stringify([{ field: 'none', group: 'report' }]),
        show_actual_stock: 'true',
        rule: JSON.stringify(rule),
        select_columns: JSON.stringify([
          { field: 'item_name', group: 'report' },
          { field: 'sku', group: 'report' },
          { field: 'quantity_available', group: 'report' },
          { field: 'quantity_available_for_sale', group: 'report' },
        ]),
        usestate: 'true',
        show_sub_categories: 'false',
        response_option: '1',
        formatneeded: 'true',
        organization_id: '893457005',
        accept: 'json',
      });

      const { data } = await this.zohoService.get<Record<string, any>>(
        `/inventory/v1/reports/inventorysummary?${searchParams.toString()}`,
        {
          connection: 'miami_distro',
        },
      );

      this.logger.log(
        `Fetched page ${page} with ${data.inventory[0].item_details.length} items`,
      );

      const pageCtx = data.page_context;
      const items = data.inventory[0].item_details;
      itemDetails.push(...items);

      if (
        items.length < pageCtx.per_page ||
        page >= pageCtx.total_pages ||
        itemDetails.length >= pageCtx.total
      ) {
        break;
      }
    }

    const items: Item[] = itemDetails.map((i) => ({
      item_id: i.item_id as string,
      sku: i.sku as string,
      item_name: i.item_name as string,
      quantity_available: Math.max(0, Number(i.quantity_available)),
      quantity_available_for_sale: Math.max(
        0,
        Number(i.quantity_available_for_sale),
      ),
    }));

    /*const prevSnapshot = await this.mongo
      .db('hbh')
      .collection('miami_distro_inventory_snapshots')
      .findOne<WithId<Snapshot>>();*/

    const changedItems =
      /*this.getChangedItems(prevSnapshot?.items || [], items)*/ items;

    return changedItems;
  }

  @Step(2)
  async execute() {
    const items = await this.getResult('fetchInventorySummary');

    const connections = [
      'miami_distro',
      // 'savage_me_dolls',
      'the_delta_boss',
      // 'shop_full_circle',
      // 'hempthrill',
      // 'shop_be_savage',
    ];

    const results = connections.reduce(
      (acc, conn) => {
        acc[conn] = {
          failed: [],
          missing: [],
          error: [],
        };
        return acc;
      },
      {} as Record<
        string,
        {
          failed: string[];
          missing: string[];
          error: any[];
        }
      >,
    );

    if (items.length === 0) {
      return results;
    }

    this.logger.log(`Updating inventory for ${items.length} changed items`);

    const chunks = chunk(items, 50);

    for (let i = 0; i < chunks.length; i++) {
      const ch = chunks[i];

      for (const connection of connections) {
        const wooClient = this.wooService.getClient(connection);

        // Separate products from variations
        const variationUpdates: Record<string, any[]> = {};
        const productUpdates: any[] = [];

        for (const item of ch) {
          const products = await wooClient.getProducts({
            sku: item.sku,
          });
          const product = products.data.find((p) => p.sku === item.sku);

          if (!product) {
            results[connection].missing.push(item.sku);
            continue;
          }

          if (product.parent_id && product.type === 'variation') {
            // Variation
            variationUpdates[product.parent_id] ??= [];
            variationUpdates[product.parent_id].push({
              id: product.id,
              stock_quantity: item.quantity_available,
              manage_stock: true,
            });
          } else {
            // Simple product
            productUpdates.push({
              id: product.id,
              stock_quantity: item.quantity_available,
              manage_stock: true,
            });
          }
        }

        // Update simple products
        if (productUpdates.length > 0) {
          try {
            const res = await wooClient.post('products/batch', {
              update: productUpdates,
            });

            results[connection].error.push(
              ...res.data.update.filter((u: any) => u.error),
            );

            if (res.status >= 400 && res.status < 600) {
              throw new Error();
            }
          } catch {
            for (const update of productUpdates) {
              const prod = products.data.find((p) => p.id === update.id);
              if (prod) {
                results[connection].failed.push(prod.sku);
              }
            }
          }
        }

        // Update variations, grouped by parent
        for (const [parentId, updates] of Object.entries(variationUpdates)) {
          try {
            const res = await wooClient.post(
              `products/${parentId}/variations/batch`,
              {
                update: updates,
              },
            );

            results[connection].error.push(
              ...res.data.update.filter((u: any) => u.error),
            );

            if (res.status >= 400 && res.status < 600) {
              throw new Error();
            }
          } catch {
            for (const update of updates) {
              const prod = products.data.find((p) => p.id === update.id);
              if (prod) {
                results[connection].failed.push(prod.sku);
              }
            }
          }
        }
      }

      this.logger.log(`Processed chunk ${i + 1}/${chunks.length}`);
    }

    /*await mongo
      .db('hbh')
      .collection('miami_distro_inventory_snapshots')
      .updateOne(
        {},
        {
          $set: {
            timestamp: Date.now(),
            items: items.filter((item) => !erroredSKUs.has(item.sku)),
          },
        },
        { upsert: true },
      );*/

    return results;
  }

  private getChangedItems(oldItems: Item[], newItems: Item[]): Item[] {
    if (oldItems.length === 0) {
      return newItems;
    }

    const oldMap = new Map(oldItems.map((item) => [item.sku, item]));
    const items: Item[] = [];

    for (const newItem of newItems) {
      const oldItem = oldMap.get(newItem.sku);

      if (!oldItem) {
        items.push(newItem);
        continue;
      }

      if (oldItem.quantity_available !== newItem.quantity_available) {
        items.push(newItem);
      }
    }

    return items;
  }
}

interface Item {
  item_id: string;
  sku: string;
  item_name: string;
  quantity_available: number;
  quantity_available_for_sale: number;
}

interface Snapshot {
  timestamp: number;
  items: Item[];
}

import { WoocommerceService } from '#lib/woocommerce/woocommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import mongodb, { WithId } from 'mongodb';
import { Logger } from '@nestjs/common';
import { chunk } from 'lodash-es';

const MongoClient = mongodb.MongoClient;

@Workflow({
  name: 'Miami Distro - Inventory Sync',
  webhook: true,
  concurrency: 1,
  triggers: [
    cron('*/30 * * * *', {
      timezone: 'America/New_York', // Every 30 minutes
    }),
  ],
})
export class MiamiDistroInventorySyncWorkflow extends WorkflowBase {
  constructor(
    private readonly wooService: WoocommerceService,
    private readonly zohoService: ZohoService,
    private readonly envService: EnvService,
  ) {
    super();
  }

  private logger = new Logger(MiamiDistroInventorySyncWorkflow.name);

  @Step(1)
  async execute() {
    if (!this.envService.isProd) {
      return this.cancel('Not running in development environment');
    }

    const itemDetails: Record<string, any>[] = [];

    for (let page = 1; ; page++) {
      const { data } = await this.zohoService.get<Record<string, any>>(
        `/inventory/v1/reports/inventorysummary?accept=json&page=${page}&per_page=5000&sort_order=A&sort_column=item_name&filter_by=TransactionDate.Today&stock_on_hand_filter=All&group_by=%5B%7B%22field%22%3A%22none%22%2C%22group%22%3A%22report%22%7D%5D&show_actual_stock=true&rule=%7B%22columns%22%3A%5B%7B%22index%22%3A1%2C%22field%22%3A%22location_name%22%2C%22value%22%3A%5B%226673885000000093096%22%5D%2C%22comparator%22%3A%22in%22%2C%22group%22%3A%22branch%22%7D%5D%2C%22criteria_string%22%3A%221%22%7D&select_columns=%5B%7B%22field%22%3A%22item_name%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22sku%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22quantity_available%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22quantity_available_for_sale%22%2C%22group%22%3A%22report%22%7D%5D&usestate=true&show_sub_categories=false&response_option=1&x-zb-source=zbclient&formatneeded=true&paper_size=A4&orientation=portrait&font_family_for_body=opensans&margin_top=0.7&margin_bottom=0.7&margin_left=0.55&margin_right=0.2&table_size=classic&table_style=default&show_org_name=true&show_generated_date=false&show_generated_time=false&show_page_number=false&show_report_basis=true&show_generated_by=false&can_fit_to_page=true&watermark_opacity=50&show_org_logo_in_header=false&show_org_logo_as_watermark=false&watermark_position=center+center&watermark_zoom=50&file_name=Inventory+Summary&organization_id=893457005&frameorigin=https%3A%2F%2Finventory.zoho.com`,
        {
          connection: 'miami_distro',
        },
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

    const mongo = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const items: Item[] = itemDetails.map((i) => ({
      item_id: i.item_id as string,
      sku: i.sku as string,
      item_name: i.item_name as string,
      quantity_available: Number(i.quantity_available),
      quantity_available_for_sale: Number(i.quantity_available_for_sale),
    }));

    const prevSnapshot = await mongo
      .db('hbh')
      .collection('miami_distro_inventory_snapshots')
      .findOne<WithId<Snapshot>>();

    const changedItems = this.getChangedItems(prevSnapshot?.items || [], items);
    const erroredSKUs = new Set<string>();
    const errors: any[] = [];

    if (changedItems.length > 0) {
      this.logger.log(
        `Updating ${changedItems.length} inventory items in WooCommerce`,
      );

      const connections = [
        'miami_distro',
        'savage_me_dolls',
        'the_delta_boss',
        // 'shop_full_circle',
        // 'hempthrill',
        // 'shop_be_savage',
      ];

      const chunks = chunk(changedItems, 50);

      for (const [i, ch] of chunks.entries()) {
        for (const connection of connections) {
          const wooClient = this.wooService.getClient(connection);

          const products = await wooClient.getProducts({
            sku: ch.map((i) => i.sku).join(','),
          });

          this.logger.log(
            `Fetched ${products.data.length} products from WooCommerce for connection ${connection}`,
          );

          // Separate products from variations
          const productUpdates: any[] = [];
          const variationUpdatesByProduct: Record<string, any[]> = {};

          for (const item of ch) {
            const product = products.data.find((p) => p.sku === item.sku);

            if (!product) continue;

            if (product.parent_id && product.type === 'variation') {
              // Variation
              variationUpdatesByProduct[product.parent_id] ??= [];
              variationUpdatesByProduct[product.parent_id].push({
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

              errors.push(...res.data.update.filter((u: any) => u.error));

              if (res.status >= 400 && res.status < 600) {
                throw new Error();
              }
            } catch {
              for (const product of productUpdates) {
                erroredSKUs.add(product.sku);
              }
            }
          }

          // Update variations, grouped by parent
          for (const [parentId, updates] of Object.entries(
            variationUpdatesByProduct,
          )) {
            try {
              const res = await wooClient.post(
                `products/${parentId}/variations/batch`,
                {
                  update: updates,
                },
              );

              errors.push(...res.data.update.filter((u: any) => u.error));

              if (res.status >= 400 && res.status < 600) {
                throw new Error();
              }
            } catch {
              for (const update of updates) {
                erroredSKUs.add(update.sku);
              }
            }
          }
        }

        this.logger.log(`Processed chunk ${i + 1}/${chunks.length}`);
      }

      // await mongo
      //   .db('hbh')
      //   .collection('miami_distro_inventory_snapshots')
      //   .updateOne(
      //     {},
      //     {
      //       $set: {
      //         timestamp: Date.now(),
      //         items: items.filter((item) => !erroredSKUs.has(item.sku)),
      //       },
      //     },
      //     { upsert: true },
      //   );
    }

    await mongo.close();

    return {
      changed: changedItems.length,
      errors,
    };
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

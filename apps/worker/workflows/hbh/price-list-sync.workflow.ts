import { BigCommerceService } from '#lib/bigcommerce/bigcommerce.service';
import { MondayService } from '#lib/monday/monday.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { MongoService } from '#lib/core/services';
import { WorkflowBase } from '#lib/workflow/misc';
import { chunk } from 'lodash-es';

@Workflow({
  name: 'HBH - Push Price List to all platforms',
  concurrency: 1,
  webhook: true,
})
export class PriceListSyncWorkflow extends WorkflowBase<Payload> {
  constructor(
    private readonly bigCommerceService: BigCommerceService,
    private readonly mondayService: MondayService,
    private readonly zohoService: ZohoService,
    private readonly mongo: MongoService,
  ) {
    super();
  }

  private bigCommerceMappings = {
    hbh: {
      'M Distro T1': 94,
      'M Distro T2': 95,
      'M Distro T3': 96,
      'Wholesale T1': 97,
      'Wholesale T2': 98,
      'Wholesale T3': 99,
      'Wholesale T4': 100,
      'Wholesale T5': 101,
      'Wholesale T6': 102,
    },
    dispomart: {
      'M Distro T1': 1,
      'M Distro T2': 2,
      'M Distro T3': 3,
      'Wholesale T1': 4,
      'Wholesale T2': 5,
      'Wholesale T3': 6,
      'Wholesale T4': 7,
      'Wholesale T5': 8,
      'Wholesale T6': 9,
    },
  };

  private inventoryMappings = {
    'M Distro T1': '3195387000084237271',
    'M Distro T2': '3195387000084244429',
    'M Distro T3': '3195387000084246587',
    'Wholesale T1': '3195387000084248745',
    'Wholesale T2': '3195387000084251903',
    'Wholesale T3': '3195387000084255061',
    'Wholesale T4': '3195387000084257219',
    'Wholesale T5': '3195387000084259383',
    'Wholesale T6': '3195387000096563127',
  };

  @Step(1)
  async validate() {
    const body = this.payload;

    if (!body.token || !body.boardId) {
      return this.cancel('Missing token or boardId');
    }

    try {
      await this.mondayService.validateSession(body.token);
    } catch {
      return this.cancel('Unauthorized');
    }
  }

  @Step(2)
  async process() {
    const client = await this.mondayService.getClient('hbh');
    const { boardId, groupId, itemIds } = this.payload;
    const itemIdChunks = chunk(itemIds, 100);
    let cursor: string | number | null = groupId ? null : 0;

    do {
      let variables: Record<string, any>;
      let query: string;

      if (groupId) {
        query = `#graphql
        query ($boardId: [ID!], $groupId: [String], $cursor: String) {
          boards(ids: $boardId){
            groups(ids: $groupId) {
              items_page(limit: 500, cursor: $cursor) {
                cursor
                items {
                  id
                  column_values {
                    column {
                      title
                    }
                    text
                  }
                }
              }
            }
          }
        }
        `;
        variables = { boardId, groupId, cursor };
      } else {
        query = `#graphql
        query ($ids: [ID!]) {
          items(ids: $ids) {
            id
            column_values {
              column {
                title
              }
              text
            }
          }
        }
        `;
        variables = { ids: itemIdChunks[cursor as number] };
      }

      const mondayRes = await client.request<GroupResult | ItemsResult>(
        query,
        variables,
      );

      const items = groupId
        ? (mondayRes as GroupResult).boards[0].groups[0].items_page.items
        : (mondayRes as ItemsResult).items;
      cursor = groupId
        ? (mondayRes as GroupResult).boards[0].groups[0].items_page.cursor
        : (cursor as number) + 1 >= itemIdChunks.length
          ? null
          : (cursor as number) + 1;

      // await this.pushToBigCommerce(items);
      // await this.pushToInventory(items);

      if (this.payload.setOK) {
        await this.updateMondayStatus(items, 'OK');
      }
    } while (cursor !== null);
  }

  async pushToBigCommerce(items: Item[]) {
    const itemsNormalized = this.normalizeMondayItems(items);

    for (const connection in this.bigCommerceMappings) {
      const groupMappings = this.bigCommerceMappings[
        connection
      ] as (typeof this.bigCommerceMappings)['hbh'];

      // Get all product IDs for SKUs in this batch
      const skuProductMap = await this.getBCProductIDs(
        itemsNormalized.map((i) => i.sku),
        connection as 'dispomart' | 'hbh',
      );

      if (skuProductMap.size === 0) {
        continue; // No products found for these SKUs in this store
      }

      for (const groupName in groupMappings) {
        const groupId = groupMappings[groupName];

        const { data: group } = await this.bigCommerceService.get(
          `/v2/customer_groups/${groupId}`,
          {
            connection,
          },
        );

        for (const item of itemsNormalized) {
          const productId = skuProductMap.get(item.sku);

          if (!productId) {
            continue;
          }

          const price = item.prices.find((p) => p.groupName === groupName);

          if (!price) {
            continue;
          }

          const rule = group.discount_rules.find(
            (r) => productId.toString() === r.product_id.toString(),
          );

          if (rule) {
            rule.amount = price.price;
          } else {
            group.discount_rules.push({
              type: 'product',
              method: 'fixed',
              amount: price.price,
              product_id: productId,
            });
          }
        }

        for (const rule of group.discount_rules) {
          // BigCommerce API quirk: amount must be a number, not a string
          // even though the api returns it as a string
          rule.amount = parseFloat(rule.amount.toString());
        }

        await this.bigCommerceService.put(
          `/v2/customer_groups/${groupId}`,
          {
            discount_rules: group.discount_rules,
          },
          {
            connection,
          },
        );

        await new Promise((r) => setTimeout(r, 200)); // To avoid rate limits
      }
    }
  }

  async pushToInventory(items: Item[]) {
    const itemsNormalized = this.normalizeMondayItems(items);
    const skuItemMap = await this.getInventoryItemIDs(
      itemsNormalized.map((i) => i.sku),
    );

    if (skuItemMap.size === 0) {
      return; // No inventory items found for these SKUs
    }

    for (const groupName in this.inventoryMappings) {
      const priceListId = this.inventoryMappings[groupName];

      const { data: res } = await this.zohoService.get(
        `/inventory/v1/pricebooks/${priceListId}`,
        {
          connection: 'hbh',
        },
      );

      const priceListItems = res.pricebook.pricebook_items;

      for (const item of itemsNormalized) {
        const inventoryItemId = skuItemMap.get(item.sku);

        if (!inventoryItemId) {
          continue;
        }

        const price = item.prices.find((p) => p.groupName === groupName);

        if (!price) {
          continue;
        }

        const priceListItem = priceListItems.find(
          (p) => p.item_id.toString() === inventoryItemId.toString(),
        );

        if (priceListItem) {
          // Update
          priceListItem.pricebook_rate = price.price;
        } else {
          priceListItems.push({
            item_id: parseInt(inventoryItemId.toString()),
            pricebook_rate: price.price,
          });
        }
      }

      await this.zohoService.put(
        `/inventory/v1/pricebooks/${priceListId}`,
        {
          name: res.pricebook.name,
          currency_id: res.pricebook.currency_id,
          pricebook_type: res.pricebook.pricebook_type,
          is_increase: res.pricebook.is_increase,
          sales_or_purchase_type: res.pricebook.sales_or_purchase_type,
          pricebook_items: priceListItems.map((pi) => ({
            item_id: pi.item_id,
            pricebook_item_id: pi.pricebook_item_id,
            pricebook_rate: parseFloat(pi.pricebook_rate.toString()),
          })),
        },
        {
          connection: 'hbh',
        },
      );

      await new Promise((r) => setTimeout(r, 400)); // To avoid rate limits
    }
  }

  async updateMondayStatus(items: Item[], status: string) {
    const client = await this.mondayService.getClient('hbh');
    const { boardId } = this.payload;

    const chunks = chunk(items, 100);

    for (const items of chunks) {
      const mutations = items.map((item, index) => {
        const statusColumn = item.column_values.find(
          (cv) => cv.column.title === 'Status',
        );

        if (!statusColumn || statusColumn.text === status) {
          return null;
        }

        return `i${index}: change_simple_column_value(item_id: ${item.id}, board_id: ${boardId}, column_id: "status", value: "${status}") { id }`;
      });

      const mutationString = mutations.filter((m) => m !== null).join('\n');

      if (mutationString) {
        const mutation = `#graphql
      mutation {
        ${mutationString}
      }
      `;

        await client.request(mutation);
      }
    }
  }

  normalizeMondayItems(items: Item[]): ItemNormalized[] {
    return items
      .map((i) => ({
        sku: i.column_values.find((cv) => cv.column.title === 'SKU')?.text,
        prices: i.column_values
          .filter((cv) =>
            Object.prototype.hasOwnProperty.call(
              this.inventoryMappings,
              cv.column.title,
            ),
          )
          .map((cv) => ({
            groupName: cv.column.title,
            price: parseFloat(cv.text),
          })),
      }))
      .filter((i) => i.sku?.toString()) as ItemNormalized[];
  }

  async getBCProductIDs(
    skus: string[],
    db: 'dispomart' | 'hbh',
  ): Promise<Map<string, number>> {
    const products = await this.mongo
      .db(db)
      .collection('bigcommerce_product')
      .find(
        {
          sku: { $in: skus },
        },
        { projection: { id: 1, sku: 1 } },
      )
      .toArray();

    const variants = await this.mongo
      .db(db)
      .collection('bigcommerce_variant')
      .find(
        {
          sku: { $in: skus },
        },
        { projection: { productId: 1, sku: 1 } },
      )
      .toArray();

    const map = new Map<string, number>();

    for (const prod of products) {
      map.set(prod.sku, prod.id);
    }

    for (const variant of variants) {
      const prodId = parseInt(variant.productId, 10);
      map.set(variant.sku, prodId);
    }

    return map;
  }

  async getInventoryItemIDs(skus: string[]): Promise<Map<string, string>> {
    const items = await this.mongo
      .db('hbh')
      .collection('item')
      .find(
        {
          sku: { $in: skus },
        },
        { projection: { id: 1, sku: 1 } },
      )
      .toArray();

    const map = new Map<string, string>();

    for (const item of items) {
      map.set(item.sku, item.id);
    }

    return map;
  }
}

interface Payload {
  token: string;
  boardId: number;
  groupId: string | null;
  itemIds: number[];
  setOK: boolean;
}

interface Item {
  id: string;
  column_values: {
    column: { title: string };
    text: string;
  }[];
}

interface GroupResult {
  boards: {
    groups: {
      items_page: {
        cursor: string | null;
        items: Item[];
      };
    }[];
  }[];
}

interface ItemsResult {
  items: Item[];
}

interface ItemNormalized {
  sku: string;
  prices: { groupName: string; price: number }[];
}

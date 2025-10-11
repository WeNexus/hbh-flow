import { BigCommerceService } from '#lib/bigcommerce/bigcommerce.service';
import { MondayService } from '#lib/monday/monday.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { WebhookPayloadType } from '#lib/workflow/types';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { MongoService } from '#lib/core/services';
import { Item } from '@mondaydotcomorg/api';

@Workflow({
  name: 'HBH - Push Price List to all platforms',
  concurrency: 1,
  webhook: true,
  webhookPayloadType: WebhookPayloadType.Body,
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
  async handleConnection() {
    if (!this.payload.challenge) {
      await this.sendResponseMeta({
        statusCode: 200,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
      await this.sendResponse('', true);
      return;
    }

    await this.sendResponseMeta({
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    await this.sendResponse(JSON.stringify(this.payload), true);
  }

  @Step(2)
  async fetchItem() {
    const { event } = this.payload;

    if (!event.pulseId) {
      return;
    }

    const client = this.mondayService.getClient('hbh');

    const { items } = await client.request(
      `#graphql
    query ($id: [ID!]) {
      items(ids: $id) {
        column_values {
          column {
            title
          }
          text
        }
      }
    }
    `,
      {
        id: event.pulseId,
      },
    );

    return items[0];
  }

  @Step(3)
  async pushToBigCommerce() {
    const item = await this.getResult<Item>('fetchItem');
    const sku = item?.column_values.find(
      (cv) => cv.column.title === 'SKU',
    )?.text;

    if (!item || !sku) {
      return this.cancel('No item or SKU found');
    }

    for (const connection in this.bigCommerceMappings) {
      const product = await this.mongo
        .db(connection)
        .collection('bigcommerce_product')
        .findOne({
          sku,
        });

      const variant = await this.mongo
        .db(connection)
        .collection('bigcommerce_variant')
        .findOne({
          sku,
        });

      const productId = variant ? variant.productId : product?.id;

      if (!productId) {
        continue;
      }

      const mappings = this.bigCommerceMappings[connection];

      for (const cv of item.column_values) {
        if (!Object.prototype.hasOwnProperty.call(mappings, cv.column.title)) {
          continue;
        }

        const groupId: number = mappings[cv.column.title];

        const { data: group } = await this.bigCommerceService.get(
          `/v2/customer_groups/${groupId}`,
          {
            connection,
          },
        );

        const rule = group.discount_rules.find(
          (r) => productId.toString() === r.product_id.toString(),
        );

        if (rule) {
          rule.amount = parseFloat(cv.text);
        } else {
          group.discount_rules.push({
            type: 'product',
            method: 'fixed',
            amount: parseFloat(cv.text),
            product_id: productId,
          });
        }

        for (const rule of group.discount_rules) {
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

        await new Promise((r) => setTimeout(r, 600)); // To avoid rate limits
      }
    }
  }

  @Step(4)
  async pushToInventory() {
    const item = await this.getResult<Item>('fetchItem');
    const sku = item?.column_values.find(
      (cv) => cv.column.title === 'SKU',
    )?.text;

    if (!item || !sku) {
      return this.cancel('No item or SKU found');
    }

    const inventoryItem = await this.mongo
      .db('hbh')
      .collection('item')
      .findOne({ sku });

    if (!inventoryItem) {
      return this.cancel('No inventory item found');
    }

    for (const cv of item.column_values) {
      if (
        !Object.prototype.hasOwnProperty.call(
          this.inventoryMappings,
          cv.column.title,
        )
      ) {
        continue;
      }

      const priceListId = this.inventoryMappings[cv.column.title];

      const { data: res } = await this.zohoService.get(
        `/inventory/v1/pricebooks/${priceListId}`,
        {
          connection: 'hbh',
        },
      );

      const priceListItems = res.pricebook.pricebook_items;

      await new Promise((r) => setTimeout(r, 500)); // To avoid rate limits

      const priceListItem = priceListItems.find(
        (p) => p.item_id.toString() === inventoryItem.id.toString(),
      );

      if (priceListItem) {
        // Update
        priceListItem.pricebook_rate = parseFloat(cv.text);
      } else {
        priceListItems.push({
          item_id: parseInt(inventoryItem.id.toString()),
          pricebook_rate: parseFloat(cv.text),
        });
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

      await new Promise((r) => setTimeout(r, 500)); // To avoid rate limits
    }
  }
}

export interface Payload {
  challenge?: string;
  event: {
    app: string;
    type: string;
    userId: number;
    boardId: number;
    isRetry: boolean;
    pulseId: number;
    destGroup: {
      id: string;
      color: string;
      title: string;
      is_top_group: boolean;
    };
    destGroupId: string;
    triggerTime: string;
    triggerUuid: string;
    sourceGroupId: string;
    subscriptionId: number;
    originalTriggerUuid: any;
  };
}

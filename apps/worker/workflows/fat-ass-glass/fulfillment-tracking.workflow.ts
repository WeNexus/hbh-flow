import { ShopifyService } from '#lib/shopify/shopify.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { WebhookPayloadType } from '#lib/workflow/types';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { ApiVersion } from '@shopify/shopify-api';
import { Logger } from '@nestjs/common';

@Workflow({
  name: 'FatAss - HBH Fulfillment Tracking',
  concurrency: 1,
  webhook: true,
  webhookPayloadType: WebhookPayloadType.Body,
})
export class FatAssGlassHBHFulfillmentTrackingWorkflow extends WorkflowBase<
  Record<string, any>
> {
  constructor(
    private readonly shopify: ShopifyService,
    private readonly zoho: ZohoService,
  ) {
    super();
  }

  private logger = new Logger(FatAssGlassHBHFulfillmentTrackingWorkflow.name);

  @Step(1)
  async fetchZohoOrder(): Promise<Record<string, any>> {
    const { data: res } = await this.zoho.get(
      `/inventory/v1/salesorders/${this.payload.shipmentorder.salesorder_id}`,
      {
        connection: 'hbh',
      },
    );

    if (!res.salesorder) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return this.cancel(
        `Salesorder with ID: ${this.payload.shipmentorder.salesorder_id} not found.`,
      ) as any;
    }

    this.delay(30000);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return res.salesorder;
  }

  @Step(2)
  async fetchShopifyOrderId(): Promise<string> {
    const salesOrder =
      await this.getResult<Record<string, any>>('fetchZohoOrder');

    if (!salesOrder) {
      throw new Error(
        `Salesorder with ID: ${this.payload.shipmentorder.salesorder_id} not found.`,
      );
    }

    const ref = this.extractOrderNumber(salesOrder.reference_number);

    if (!ref) {
      throw new Error(
        `Could not extract order number from salesorder reference number: ${salesOrder.reference_number}`,
      );
    }

    const query = `#graphql 
    query {
      orders(first: 1, query: "name:${ref}", sortKey: ID, reverse: true) {
        edges {
          node {
            id
          }
        }
      }
    }`;

    const { edges } = await this.shopify.gql<{
      edges: [
        {
          node: {
            id: string;
          };
        },
      ];
    }>({
      connection: 'fat_ass',
      root: 'orders',
      query,
    });

    if (!edges.length) {
      return this.cancel(`Order ${ref} not found in Shopify`)!;
    }

    return edges[0].node.id;
  }

  @Step(3)
  async fetchShopifyFulfillmentOrder(): Promise<FulfillmentOrder> {
    const shopifyOrderId = (await this.getResult<string>(
      'fetchShopifyOrderId',
    ))!;

    const { data: res } = await this.shopify.get<FulfillmentOrderRes>(
      `/admin/api/${ApiVersion.April26}/orders/${shopifyOrderId.split('/').pop()}/fulfillment_orders.json`,
      {
        connection: 'fat_ass',
      },
    );

    const fulfillmentOrder = res.fulfillment_orders.find(
      (f) => f.status === 'open' && f.assigned_location_id === 74968563910,
    );

    if (!fulfillmentOrder) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return this.cancel(
        `No open fulfillment order found in the specified location: 74968563910`,
      ) as any;
    }

    return fulfillmentOrder;
  }

  @Step(4)
  async createFulfillment() {
    const fulfillmentOrder = (await this.getResult<FulfillmentOrder>(
      'fetchShopifyFulfillmentOrder',
    ))!;

    const shipmentOrder = this.payload.shipmentorder;

    const lineItemsToFulfill = fulfillmentOrder.line_items
      .filter((item) => item.fulfillable_quantity > 0)
      .map((item) => ({
        id: `gid://shopify/FulfillmentOrderLineItem/${item.id}`,
        quantity: item.fulfillable_quantity,
      }));

    if (lineItemsToFulfill.length === 0) {
      return this.exit('No items to fulfill.');
    }

    const mutation = `#graphql
    mutation ($input: FulfillmentInput!) {
      fulfillmentCreate(fulfillment: $input) {
        fulfillment {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
    `;

    return this.shopify.gql<Record<string, any>>({
      query: mutation,
      connection: 'fat_ass',
      root: 'fulfillmentCreate',
      variables: {
        input: {
          lineItemsByFulfillmentOrder: {
            fulfillmentOrderId: `gid://shopify/FulfillmentOrder/${fulfillmentOrder.id}`,
            fulfillmentOrderLineItems: lineItemsToFulfill,
          },
          trackingInfo: {
            company: shipmentOrder.carrier,
            number: shipmentOrder.tracking_number,
            // url: shipmentOrder.tracking_link,
          },
        },
      },
    });
  }

  extractOrderNumber(reference: string): string | null {
    // Try to find digits after an optional # with optional surrounding spaces
    const match = reference.match(/#\s*(\d+)/);
    if (match) return match[1];

    // Fallback: grab any standalone number (e.g. "FGC 33382")
    const fallback = reference.match(/(?<![#\d])(\d+)(?!\d)/);
    return fallback?.[1] ?? null;
  }
}

interface FulfillmentOrderRes {
  fulfillment_orders: FulfillmentOrder[];
}

interface FulfillmentOrder {
  id: number;
  created_at: string;
  updated_at: string;
  shop_id: number;
  order_id: number;
  assigned_location_id: number;
  request_status: string;
  status: 'closed' | 'open';
  fulfill_at: string;
  fulfill_by: any;
  supported_actions: any[];
  destination: Destination;
  line_items: LineItem[];
  international_duties: any;
  fulfillment_holds: any[];
  delivery_method: DeliveryMethod;
  assigned_location: AssignedLocation;
  merchant_requests: any[];
}

interface Destination {
  id: number;
  address1: string;
  address2: string;
  city: string;
  company: any;
  country: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  province: string;
  zip: string;
}

interface LineItem {
  id: number;
  shop_id: number;
  fulfillment_order_id: number;
  quantity: number;
  line_item_id: number;
  inventory_item_id: number;
  fulfillable_quantity: number;
  variant_id: number;
}

interface DeliveryMethod {
  id: number;
  method_type: string;
  min_delivery_date_time: any;
  max_delivery_date_time: any;
  additional_information: AdditionalInformation;
  service_code: string;
  source_reference: any;
  presented_name: string;
  branded_promise: any;
}

interface AdditionalInformation {
  instructions: any;
  phone: any;
}

interface AssignedLocation {
  address1: string;
  address2: string;
  city: string;
  country_code: string;
  location_id: number;
  name: string;
  phone: string;
  province: string;
  zip: string;
}

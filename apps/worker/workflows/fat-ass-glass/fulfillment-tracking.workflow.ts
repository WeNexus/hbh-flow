import { ShopifyService } from '#lib/shopify/shopify.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { Logger } from '@nestjs/common';

@Workflow({
  name: 'FatAss - HBH Fulfillment Tracking',
  concurrency: 1,
  webhook: true,
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
  async fetchZohoOrder() {
    const { data: res } = await this.zoho.get(
      `/inventory/v1/salesorders/${this.payload.shipmentorder.salesorder_id}`,
      {
        connection: 'hbh',
      },
    );

    return res.salesorder as Record<string, any>;
  }

  @Step(2)
  async fetchShopifyFulfillmentOrder() {
    const salesOrder =
      await this.getResult<Record<string, any>>('fetchZohoOrder');

    if (!salesOrder) {
      throw new Error(
        `Salesorder with ID: ${this.payload.shipmentorder.salesorder_id} not found.`,
      );
    }

    const mainQuery = `#graphql 
    query {
      orders(first: 1, query: "name:${salesOrder.reference_number.replace('FGC', '')}") {
        edges {
          node {
            fulfillmentOrders(first: 1, query: "assigned_location_id:74968563910") {
              edges {
                node {
                  id
                  lineItems(first: 1) {
                    pageInfo {
                      hasNextPage
                      endCursor
                    }
                    edges {
                      node {
                        id
                        sku
                        remainingQuantity
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`;
    const lineItemQuery = `#graphql
    query ($cursor: String, $foId: ID!) {
      fulfillmentOrder(id: $foId) {
        lineItems(first: 100, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              sku
              remainingQuantity
            }
          }
        }
      }
    }
    `;

    const { edges } = await this.shopify.gql({
      connection: 'fat_ass',
      root: 'orders',
      query: mainQuery,
    });

    const fulfillmentOrder: Record<string, any> =
      edges[0].node.fulfillmentOrders.edges[0].node;

    while (fulfillmentOrder.lineItems.pageInfo.hasNextPage) {
      const { lineItems } = await this.shopify.gql({
        query: lineItemQuery,
        connection: 'fat_ass',
        root: 'fulfillmentOrder',
        variables: {
          foId: fulfillmentOrder.id,
          cursor: fulfillmentOrder.lineItems.pageInfo.endCursor,
        },
      });

      fulfillmentOrder.lineItems.pageInfo = lineItems.pageInfo;
      fulfillmentOrder.lineItems.edges.push(...lineItems.edges);

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return fulfillmentOrder;
  }

  @Step(3)
  async createFulfillment() {
    const fulfillmentOrder = await this.getResult<Record<string, any>>(
      'fetchShopifyFulfillmentOrder',
    );
    const zohoOrder =
      (await this.getResult<Record<string, any>>('fetchZohoOrder'))!;

    if (!fulfillmentOrder) {
      throw new Error(
        'Something went wrong with the fetchShopifyFulfillmentOrder step',
      );
    }

    const shipmentOrder = this.payload.shipmentorder;
    const zohoSkus = new Set(
      zohoOrder.line_items.map((i: { sku: string }) => i.sku),
    );

    const lineItemsToFulfill = fulfillmentOrder.lineItems.edges
      .map((edge: Record<string, any>) => edge.node)
      .filter(
        (item: Record<string, any>) =>
          item.remainingQuantity > 0 && zohoSkus.has(item.sku),
      )
      .map((item: Record<string, any>) => ({
        id: item.id,
        quantity: item.remainingQuantity,
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
            fulfillmentOrderId: fulfillmentOrder.id,
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
}

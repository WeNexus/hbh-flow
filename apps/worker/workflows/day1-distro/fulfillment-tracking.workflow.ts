import { OrderDeskService } from '#lib/orderdesk/order-desk.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { WebhookPayloadType } from '#lib/workflow/types';
import { ZohoService } from '#lib/zoho/zoho.service';
import { WorkflowBase } from '#lib/workflow/misc';
import { Logger } from '@nestjs/common';

@Workflow({
  name: 'Day 1 Distro - HBH Fulfillment Tracking',
  concurrency: 1,
  webhook: true,
  webhookPayloadType: WebhookPayloadType.Body,
})
export class Day1DistroHBHFulfillmentTrackingWorkflow extends WorkflowBase<
  Record<string, any>
> {
  constructor(
    private readonly orderDesk: OrderDeskService,
    private readonly zoho: ZohoService,
  ) {
    super();
  }

  private logger = new Logger(Day1DistroHBHFulfillmentTrackingWorkflow.name);

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
  async createShipment() {
    const zohoOrder =
      (await this.getResult<Record<string, any>>('fetchZohoOrder'))!;

    const shipmentOrder = this.payload.shipmentorder;

    let orderDeskId = zohoOrder.custom_fields.find(
      (cf) => cf.api_name === 'cf_shopify_order_id',
    )?.value;

    if (typeof orderDeskId === 'string') {
      orderDeskId = orderDeskId.trim();
    }

    if (!orderDeskId) {
      throw new Error(`OrderDesk Order ID not found`);
    }

    const { data } = await this.orderDesk.post(
      `/v2/orders/${orderDeskId}/shipments`,
      {
        tracking_number: shipmentOrder.tracking_number,
        carrier_code: shipmentOrder.carrier,
        tracking_url: shipmentOrder.tracking_link,
      },
      {
        connection: 'day1distro',
      },
    );

    return data;
  }
}

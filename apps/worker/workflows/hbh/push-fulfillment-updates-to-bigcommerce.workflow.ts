import { BigCommerceService } from '#lib/bigcommerce/bigcommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { WebhookPayloadType } from '#lib/workflow/types';
import { WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import mongodb from 'mongodb';

const MongoClient = mongodb.MongoClient;

@Workflow({
  webhook: true,
  webhookPayloadType: WebhookPayloadType.Full,
  name: 'HBH - Push Fulfillment Updates to BigCommerce',
})
export class PushFulfillmentUpdatesToBigcommerceWorkflow extends WorkflowBase<
  Record<string, any>,
  { runs: number }
> {
  constructor(
    private readonly bigCommerceService: BigCommerceService,
    private readonly envService: EnvService,
  ) {
    super();
  }

  @Step(1)
  async fetchData() {
    const channel = this.payload.body.salesorder.reference_number.startsWith(
      'WS_Online_Order_',
    )
      ? 'hbh'
      : 'dispomart';

    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const db = client.db(channel);

    const orderIds = await db.collection('order').findOne({
      inventoryOrderId: this.payload.body.salesorder.salesorder_id,
    });

    await client.close();

    return {
      orderIds,
      channel,
    };
  }

  @Step(2)
  async updateBigCommerceOrder() {
    const { orderIds, channel } = await this.getResult('fetchData');
    const { order_status, shipment_status } = this.payload.query;
    const { salesorder } = this.payload.body;

    if (!orderIds) {
      return this.cancel('Not a BigCommerce Order');
    }

    const statusId =
      order_status === 'void'
        ? 5
        : order_status === 'rejected'
          ? 6
          : shipment_status === 'Shipped'
            ? 2
            : shipment_status === 'Partially Shipped'
              ? 3
              : shipment_status === 'Fulfilled' ||
                  salesorder.order_status === 'closed'
                ? 10
                : salesorder.paid_status === 'paid'
                  ? 11
                  : null;

    if (!statusId) {
      return this.cancel('Unsupported status');
    }

    await this.bigCommerceService.put(
      `/v2/orders/${orderIds.bigCommerceOrderId}`,
      {
        status_id: statusId,
      },
      {
        connection: channel,
      },
    );

    if (statusId !== 2 && statusId !== 3) {
      return this.cancel(
        'Order status is neither shipped nor partially-shipped',
      );
    }

    return statusId;
  }
}

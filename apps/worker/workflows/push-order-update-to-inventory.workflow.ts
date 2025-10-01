import { BigCommerceService } from '#lib/bigcommerce/bigcommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import mongodb from 'mongodb';
import axios from 'axios';

const MongoClient = mongodb.MongoClient;

@Workflow({
  webhook: true,
  name: 'Push BigCommerce Order to Inventory',
})
export class PushOrderUpdateToInventoryWorkflow extends WorkflowBase<
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
  async execute() {
    const channel =
      this.payload.producer === 'stores/to8tttzuxj' ? 'hbh' : 'dispomart';

    const { data: order } = await this.bigCommerceService.get(
      `/v2/orders/${this.payload.data.id}`,
      {
        connection: channel,
      },
    );

    const client = await MongoClient.connect(
      this.envService.getString('MONGO_URL'),
    );

    const db = client.db(channel);

    const workflowURLs = await db
      .collection('bigcommerce_incomplete_order')
      .findOne({
        id: order.id,
      });

    if (!workflowURLs) {
      return this.cancel("Couldn't fetch workflow URLs");
    }

    const { cancelURL, resumeURL } = workflowURLs;
    const status = order.status;

    const url =
      status === 'Incomplete' ||
      status === 'Pending' ||
      status === 'Refunded' ||
      status === 'Cancelled' ||
      status === 'Declined' ||
      status === 'Disputed'
        ? cancelURL
        : resumeURL;

    await axios.post(url);
  }
}

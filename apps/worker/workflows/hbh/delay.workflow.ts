import { Step, Workflow } from '#lib/workflow/decorators';
import { WebhookPayloadType } from '#lib/workflow/types';
import { WorkflowBase } from '#lib/workflow/misc';

@Workflow({
  name: 'Delay',
  webhookPayloadType: WebhookPayloadType.Query,
  webhook: true,
  concurrency: 1000,
})
export class DelayWorkflow extends WorkflowBase<Payload> {
  @Step(1)
  async execute() {
    const delay = Number(this.payload.query.delay || 200);

    await new Promise((resolve) => setTimeout(resolve, delay));

    if (!this.responseMetaSent) {
      await this.sendResponseMeta({
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      await this.sendResponse(
        JSON.stringify({
          delay,
        }),
        true,
      );
    }
  }
}

interface Payload {
  query: {
    delay: string;
  };
}

import { Step, Workflow } from '#lib/workflow/decorators';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { HubService } from '../hub.service';
import { Logger } from '@nestjs/common';

/**
 * Test connections to all providers every 30 minutes.
 * @internal
 */
@Workflow({
  internal: true,
  triggers: [cron('*/30 * * * *')], // Every 30 minutes
})
export class ConnectionTestWorkflow extends WorkflowBase {
  constructor(private readonly hubService: HubService) {
    super();
  }

  private logger = new Logger(ConnectionTestWorkflow.name);

  @Step(0)
  async execute() {
    for (const provider of this.hubService.providersArray) {
      const clientOptions = provider.client.clientOptions;

      for (const connection of clientOptions.connections) {
        try {
          await this.hubService.testConnection(
            provider.options.id,
            connection.id,
          );
        } catch (e: unknown) {
          this.logger.error(
            `Connection test failed for provider ${provider.type} with connection ${connection.id}, error: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
  }
}

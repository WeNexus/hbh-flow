import { WorkflowService } from '#lib/workflow/workflow.service';
import { WorkflowBase } from '#lib/workflow/misc/workflow-base';
import { Workflow, Step } from '#lib/workflow/decorators';
import { WorkflowOptions } from '#lib/workflow/types';
import { ModuleRef, Reflector } from '@nestjs/core';
import { PrismaService } from '#lib/core/services';
import { Logger } from '@nestjs/common';

/**
 * This is an internal workflow, which should run every time the app starts up.
 * It sets up schedulers in BullMQ
 *
 * @internal
 */

@Workflow({ internal: true })
export class ChownJobsWorkflow extends WorkflowBase {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    moduleRef: ModuleRef,
  ) {
    super(moduleRef);
  }

  private readonly logger = new Logger(ChownJobsWorkflow.name);

  @Step(1)
  async execute() {
    // This workflow must not update the schedules in the database, as it's already handled by the SetupCronWorkflow.

    for (const workflow of this.workflowService.workflows) {
      const options = this.reflector.get<WorkflowOptions | undefined>(
        'HBH_FLOW',
        workflow,
      );

      if (!options?.oldName) {
        // If there is no old name, we skip it.
        continue;
      }

      // There is an old name, so we move the jobs from the old name to the new name.

      const result = await this.prisma.job.updateMany({
        where: {
          name: options.oldName,
        },
        data: {
          name: workflow.name,
        },
      });

      this.logger.log(
        `Updated ${result.count} jobs from ${options.oldName} to ${workflow.name}`,
      );
    }
  }
}

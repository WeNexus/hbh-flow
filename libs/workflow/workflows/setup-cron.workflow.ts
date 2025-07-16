import { WorkflowService } from '#lib/workflow/workflow.service';
import { WorkflowBase } from '#lib/workflow/misc/workflow-base';
import { Workflow, Step } from '#lib/workflow/decorators';
import { WorkflowOptions } from '#lib/workflow/types';
import { ModuleRef, Reflector } from '@nestjs/core';
import { PrismaService } from '#lib/core/services';
import { TriggerType } from '#lib/workflow/misc';
import { Logger } from '@nestjs/common';

/**
 * This is an internal workflow, which should run every time the app starts up.
 * It sets up schedulers in BullMQ
 *
 * @internal
 */

@Workflow({ internal: true })
export class SetupCronWorkflow extends WorkflowBase {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    moduleRef: ModuleRef,
  ) {
    super(moduleRef);
  }

  private readonly logger = new Logger(SetupCronWorkflow.name);

  @Step(1)
  async execute() {
    const scheduleIds: number[] = [];

    for (const workflow of this.workflowService.workflows) {
      const options = this.reflector.get<WorkflowOptions | undefined>(
        'HBH_FLOW',
        workflow,
      );

      if (!options?.triggers) {
        continue;
      }

      for (const trigger of options.triggers) {
        if (trigger.type !== TriggerType.Cron) {
          // We only care about cron triggers in this workflow
          continue;
        }

        this.logger.log(
          `Setting up cron for workflow: ${workflow.name} with pattern: ${trigger.pattern}`,
        );

        const { schedule } = await this.workflowService.repeat(workflow, {
          oldName: options.oldName,
          repeat: {
            immediate: trigger.immediate,
            pattern: trigger.pattern!,
            timezone: trigger.timezone,
            oldPattern: trigger.oldPattern,
          },
        });

        // Keep track of the schedule IDs to ignore these when deactivating dangling schedules
        scheduleIds.push(schedule.id);
      }
    }

    const danglingSchedules = await this.prisma.schedule.findMany({
      where: {
        active: true,
        id: {
          notIn: scheduleIds,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    // Deactivate dangling schedules
    await this.prisma.schedule.updateMany({
      where: {
        id: {
          in: danglingSchedules.map((s) => s.id),
        },
      },
      data: {
        active: false,
      },
    });

    // Remove dangling schedules from BullMQ
    for (const schedule of danglingSchedules) {
      await this.workflowService.workflowsByName
        .get(schedule.name)
        ?.queue?.removeJobScheduler(`#${schedule.id}`);
    }
  }
}

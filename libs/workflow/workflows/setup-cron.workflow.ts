import { ActivityService, PrismaService } from '#lib/core/services';
import { WorkflowService } from '#lib/workflow/workflow.service';
import { WorkflowBase } from '#lib/workflow/misc/workflow-base';
import { Workflow, Step } from '#lib/workflow/decorators';
import { TriggerType } from '#lib/workflow/misc';
import { ModuleRef } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { omit } from 'lodash-es';

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
    private readonly activityService: ActivityService,
    private readonly prisma: PrismaService,
    moduleRef: ModuleRef,
  ) {
    super(moduleRef);
  }

  private readonly logger = new Logger(SetupCronWorkflow.name);

  @Step(1)
  async execute() {
    const scheduleIds: number[] = [];

    for (const workflow of this.workflowService.flows) {
      const config = await this.workflowService.getConfig(workflow);

      if (!config?.triggers) {
        // No triggers defined for this workflow, skip it
        continue;
      }

      for (const trigger of config.triggers) {
        if (trigger.type !== TriggerType.Cron) {
          // We only care about cron triggers in this workflow
          continue;
        }

        this.logger.log(
          `Setting up cron for workflow: ${workflow.name} with pattern: ${trigger.pattern}`,
        );

        const { schedule } = await this.workflowService.repeat(workflow, {
          immediate: trigger.immediate,
          pattern: trigger.pattern!,
          timezone: trigger.timezone,
          oldPattern: trigger.oldPattern,
        });

        // Keep track of the schedule IDs to ignore these when deactivating dangling schedules
        scheduleIds.push(schedule.id);
      }
    }

    const { result: needToBeDanglingSchedules } =
      await this.prisma.schedule.findMany({
        where: {
          userDefined: false,
          id: { notIn: scheduleIds },
          dangling: false,
        },
      });

    const { result: userDefinedDanglingSchedules } =
      await this.prisma.schedule.findMany({
        where: {
          userDefined: true,
          dangling: true,
        },
      });

    if (needToBeDanglingSchedules.length > 0) {
      // Mark dangling schedules in the database
      await this.prisma.schedule.updateMany({
        where: {
          id: {
            in: needToBeDanglingSchedules.map((s) => s.id),
          },
        },
        data: {
          dangling: true,
        },
      });
    }

    const toRemoveSchedules = needToBeDanglingSchedules.concat(
      userDefinedDanglingSchedules,
    );

    // Remove dangling schedules from BullMQ
    for (const schedule of toRemoveSchedules) {
      const dbFlow = await this.workflowService.getDBFlow(schedule.workflowId);

      await this.workflowService
        .getQueue(dbFlow.id)
        .then((queue) => queue.removeJobScheduler(`#${schedule.id}`));
    }

    if (needToBeDanglingSchedules.length > 0) {
      await this.activityService.recordActivities(
        needToBeDanglingSchedules.map((s) => {
          const updated = { ...s };

          updated.dangling = true; // Mark as dangling

          return {
            userId: 1, // System user ID
            action: 'UPDATE',
            resource: 'SCHEDULE',
            resourceId: s.id,
            subAction: 'DANGLING',
            data: omit({ ...s }, 'updatedAt'), // Previous state before marking as dangling
            updated: omit(updated, 'updatedAt'),
          };
        }),
      );
    }

    if (userDefinedDanglingSchedules.length) {
      // Delete user-defined dangling schedules
      await this.prisma.schedule.deleteMany({
        where: {
          userDefined: true,
          dangling: true,
        },
      });

      // No need to record activity for user-defined schedules,
      // because it should be already recorded when the schedule was made dangling
    }
  }
}

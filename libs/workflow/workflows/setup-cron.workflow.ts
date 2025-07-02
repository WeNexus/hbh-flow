import { Workflow, WorkflowOptions } from '../decorators/workflow.decorator.js';
import { PrismaService } from '#lib/core/prisma.service.js';
import { WorkflowService } from '../workflow.service.js';
import { Step } from '../decorators/step.decorator.js';
import { TriggerType } from '../types/trigger-meta.js';
import { Reflector } from '@nestjs/core';
import { Logger } from '@nestjs/common';

/**
 * This is an internal workflow, which should run every time the app starts up.
 * It sets up schedulers in BullMQ
 */

@Workflow()
export class SetupCronWorkflow {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

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
          repeat: {
            immediate: trigger.immediate,
            pattern: trigger.pattern!,
            timezone: trigger.timezone,
            oldPattern: trigger.oldPattern,
            oldName: trigger.oldName,
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
        // @ts-expect-error private property
        ?.queue?.removeJobScheduler(`#${schedule.id}`);
    }
  }

  @Step(2)
  test() {}
}

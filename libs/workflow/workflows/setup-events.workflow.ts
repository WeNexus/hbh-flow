import { ActivityService, PrismaService } from '#lib/core/services';
import { WorkflowService } from '#lib/workflow/workflow.service';
import { WorkflowBase } from '#lib/workflow/misc/workflow-base';
import { Workflow, Step } from '#lib/workflow/decorators';
import { TriggerType } from '#lib/workflow/misc';
import { ModuleRef } from '@nestjs/core';
import { Logger } from '@nestjs/common';

/**
 * This is an internal workflow, which should run every time the app starts up.
 * It sets up event triggers for all workflows that have them defined.
 *
 * @internal
 */

@Workflow({ internal: true })
export class SetupEventsWorkflow extends WorkflowBase {
  constructor(
    private readonly activityService: ActivityService,
    private readonly workflowService: WorkflowService,
    private readonly prisma: PrismaService,
    moduleRef: ModuleRef,
  ) {
    super(moduleRef);
  }

  private readonly logger = new Logger(SetupEventsWorkflow.name);

  @Step(1)
  async execute() {
    const eventIds: number[] = [];

    for (const workflow of this.workflowService.flows) {
      const config = await this.workflowService.getConfig(workflow);

      const triggers = config?.triggers?.filter(
        (trigger) => trigger.type === TriggerType.Event,
      );

      if (!triggers?.length) {
        // No event triggers defined for this workflow
        continue;
      }

      this.logger.log(
        `Setting up event triggers for workflow: ${workflow.name}, triggers: ${triggers.map((t) => t.event).join(', ')}`,
      );

      for (const trigger of triggers) {
        const dbWorkflow = await this.workflowService.getDBFlow(workflow);
        const events = Array.isArray(trigger.event)
          ? trigger.event
          : [trigger.event!];

        for (const event of events) {
          const { result: existing } = await this.prisma.event.findFirst({
            where: {
              workflowId: dbWorkflow.id,
              name: event,
              provider: trigger.provider,
              connection: trigger.connection,
            },
            cache: {
              key: `event:${dbWorkflow.id}:${trigger.provider ?? ''}:${trigger.connection ?? ''}:${event}`,
            },
          });

          const { result: updated } = await this.prisma.event.upsert({
            where: {
              id: existing?.id ?? 0, // Use 0 to create a new record if it doesn't exist
            },
            create: {
              workflowId: dbWorkflow.id,
              name: event,
              provider: trigger.provider,
              connection: trigger.connection,
            },
            update: {
              provider: trigger.provider,
              connection: trigger.connection,
            },
            uncache: {
              uncacheKeys: [
                `event:${dbWorkflow.id}:${trigger.provider ?? ''}:${trigger.connection ?? ''}:${event}`,
              ],
            },
          });
          eventIds.push(updated.id);

          if (!existing) {
            // If this is a new event, record it in the activity log
            await this.activityService.recordActivity({
              action: 'CREATE',
              userId: 1, // System user ID
              resource: 'EVENT',
              resourceId: updated.id,
              subAction: 'SETUP_EVENT',
              updated,
            });
          }
        }
      }
    }

    const { result: danglingEvents } = await this.prisma.event.findMany({
      where: {
        dangling: false,
        id: {
          notIn: eventIds,
        },
      },
    });

    if (danglingEvents.length > 0) {
      // Mark dangling events in the database
      await this.prisma.event.updateMany({
        where: {
          id: {
            in: danglingEvents.map((s) => s.id),
          },
        },
        data: {
          dangling: true,
        },
      });

      await this.activityService.recordActivities(
        danglingEvents.map((e) => {
          const updated = { ...e };

          updated.dangling = true; // Mark as dangling

          return {
            userId: 1, // System user ID
            action: 'UPDATE',
            resource: 'EVENT',
            resourceId: e.id,
            subAction: 'DANGLING',
            data: { ...e }, // Previous state before marking as dangling
            updated,
          };
        }),
      );
    }
  }
}

import type { InputJsonValue } from '@prisma/client/runtime/library';
import type { RecordActivityConfig } from '#lib/core/types';
import { Activity, Revision } from '@prisma/client';
import { PrismaService } from './prisma.service';
import * as jsondiffpatch from 'jsondiffpatch';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an activity in the database.
   * @param config - Configuration for the activity to be recorded.
   * @returns The recorded activity and its associated revision, if applicable.
   */
  async recordActivity(config: RecordActivityConfig) {
    const { result: activity } = await this.prisma.activity.create({
      data: {
        userId: config.userId,
        action: config.action,
        resource: config.resource,
        resourceId: config.resourceId,
        subAction: config.subAction,
        details: {
          ip: config.req?.ip,
          userAgent: config.req?.headers['user-agent'],
          ...config.details,
        },
      },
    });

    let revision: Revision | null = null;

    if (
      Object.prototype.hasOwnProperty.call(config, 'data') ||
      Object.prototype.hasOwnProperty.call(config, 'updated')
    ) {
      if (!config.resource || !config.resourceId) {
        throw new Error(
          'Resource and resourceId are required for revision tracking',
        );
      }

      const updated = (config.updated ?? {}) as InputJsonValue;
      const data = (config.data ?? {}) as InputJsonValue;

      revision = (
        await this.prisma.revision.create({
          data: {
            activityId: activity.id,
            action: config.action,
            resource: config.resource,
            resourceId: config.resourceId,
            data: (config.data ?? {}) as InputJsonValue,
            delta: jsondiffpatch.diff(
              data,
              updated,
            ) as unknown as InputJsonValue,
          },
        })
      ).result;
    }

    return { activity, revision };
  }

  /**
   * Records multiple activities in the database.
   * @param configs - An array of configurations for the activities to be recorded.
   * @returns An array of objects containing the recorded activity and its associated revision, if applicable.
   */
  async recordActivities(
    configs: RecordActivityConfig[],
  ): Promise<{ activity: Activity; revision: Revision | null }[]> {
    return Promise.all(configs.map((config) => this.recordActivity(config)));
  }
}

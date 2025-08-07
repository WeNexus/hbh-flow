import { ActivityGateway } from '#app/api/gateways/activity.gateway';
import type { InputJsonValue } from '@prisma/client/runtime/library';
import { Activity, type Resource, Revision } from '@prisma/client';
import type { RecordActivityConfig } from '#lib/core/types';
import { PrismaService } from './prisma.service';
import * as jsondiffpatch from 'jsondiffpatch';
import { Injectable } from '@nestjs/common';
import { omit } from 'lodash-es';

@Injectable()
export class ActivityService {
  constructor(
    private readonly activityGateway: ActivityGateway,
    private readonly prisma: PrismaService,
  ) {}

  private omitKeys: Partial<Record<Resource, string[]>> = {
    JOB: ['sentryTrace', 'sentryBaggage', 'payload', 'options'],
    SCHEDULE: ['userDefined'],
  };
  private sensitiveKeys: Partial<Record<Resource, string[]>> = {
    USER: ['password'],
    OAUTH2_TOKEN: ['access', 'refresh'],
    WEBHOOK: ['token', 'secret'],
  };

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

      const sensitiveKeys = this.sensitiveKeys[config.resource];
      const omitKeys = this.omitKeys[config.resource];

      const updated = (
        omitKeys
          ? omit(config.updated ?? {}, omitKeys)
          : config.updated
            ? { ...config.updated }
            : {}
      ) as InputJsonValue;

      const data = (
        omitKeys
          ? omit(config.data ?? {}, omitKeys)
          : config.data
            ? { ...config.data }
            : {}
      ) as InputJsonValue;

      if (sensitiveKeys?.length) {
        // Redact sensitive keys from data and updated
        for (const key of sensitiveKeys) {
          if (Object.prototype.hasOwnProperty.call(data, key)) {
            data[key] = '********';
          }

          if (Object.prototype.hasOwnProperty.call(updated, key)) {
            updated[key] = '********';
          }
        }
      }

      revision = (
        await this.prisma.revision.create({
          data: {
            id: activity.id,
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

    this.activityGateway.notifyActivity(activity, revision);

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

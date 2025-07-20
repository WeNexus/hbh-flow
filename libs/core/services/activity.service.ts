import type { InputJsonValue } from '@prisma/client/runtime/library';
import type { RecordActivityConfig } from '#lib/core/types';
import { PrismaService } from './prisma.service';
import * as jsondiffpatch from 'jsondiffpatch';
import { Injectable } from '@nestjs/common';
import { Revision } from '@prisma/client';

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async recordActivity(config: RecordActivityConfig) {
    const activity = await this.prisma.activity.create({
      data: {
        userId: config.auth.user.id,
        action: config.action,
        resource: config.resource,
        resourceId: config.resourceId?.toString(),
        subAction: config.subAction,
        details: {
          ip: config.req.ip,
          userAgent: config.req.headers['user-agent'],
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

      revision = await this.prisma.revision.create({
        data: {
          activityId: activity.id,
          action: config.action,
          resource: config.resource,
          resourceId: config.resourceId,
          data: (config.data ?? {}) as InputJsonValue,
          delta: jsondiffpatch.diff(data, updated) as unknown as InputJsonValue,
        },
      });
    }

    return { activity, revision };
  }
}

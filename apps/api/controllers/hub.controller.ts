import { ActivityService, PrismaService } from '#lib/core/services';
import { Controller, Query, Get, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HubService } from '#lib/hub/hub.service';
import type { Request } from 'express';
import * as arctic from 'arctic';

import {
  NoConnectionException,
  NoProviderException,
  NoStateException,
} from '#lib/hub/exceptions';

@Controller('api/hub')
export class HubController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly hubService: HubService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('/callback')
  @ApiOperation({
    summary: 'OAuth2 Callback Handler',
    description:
      'Handles the OAuth2 callback after the user authorizes the application. This endpoint exchanges the code for access tokens and logs the connection.',
  })
  @ApiResponse({
    status: 200,
    description: 'OAuth2 flow completed successfully.',
  })
  async callback(
    @Req() req: Request,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    try {
      const { dbTokens } = await this.hubService.handleCallback(state, code);
      const activity = await this.prisma.activity.findFirstOrThrow({
        where: {
          resource: 'OAUTH2_AUTH_STATE',
          subAction: 'OAUTH2_INITIATE_AUTHORIZATION',
          resourceId: {
            equals: state,
          },
        },
      });

      await this.activityService.recordActivity({
        req,
        action: 'CREATE',
        resource: 'OAUTH2_TOKEN',
        resourceId: {
          provider: dbTokens.provider,
          connection: dbTokens.connection,
        },
        subAction: 'OAUTH2_AUTHORIZATION',
        userId: activity.result?.userId,
      });

      return `
      <h1 style="margin-left: auto; margin-right: auto; text-align: center;">
        ✅ Connection established successfully! You may now close this window.
      </h1>
      `;
    } catch (e: unknown) {
      if (
        e instanceof NoProviderException ||
        e instanceof NoConnectionException ||
        e instanceof NoStateException ||
        e instanceof arctic.OAuth2RequestError
      ) {
        return `
      <h1 style="margin-left: auto; margin-right: auto; text-align: center;">
        ⚠️ ${e.message}<br />Please try again or contact support if the issue persists.
      </h1>
        `;
      }

      throw e; // Re-throw unexpected/unhandled errors
    }
  }
}

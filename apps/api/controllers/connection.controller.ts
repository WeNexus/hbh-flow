import { TokenClientConnection, OAuth2Connection } from '#lib/hub/types';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ActivityService, PrismaService } from '#lib/core/services';
import { Auth, Protected } from '#lib/auth/decorators';
import type { AuthContext } from '#lib/auth/types';
import { HubService } from '#lib/hub/hub.service';
import type { Request } from 'express';

import {
  NotConnectedException,
  NoConnectionException,
  NoProviderException,
} from '#lib/hub/exceptions';

import {
  ConnectionAuthorizationOutputSchema,
  ConnectionTestOutputSchema,
  ConnectionDetailSchema,
  ConnectionSchema,
} from '../schema';

import {
  NotFoundException,
  Controller,
  HttpCode,
  Param,
  Query,
  Post,
  Get,
  Req,
} from '@nestjs/common';

@Controller('api/providers')
export class ConnectionController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly hubService: HubService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('/:id/connections')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'List all connections for a provider',
    description:
      'Returns a list of available connections configured for a given provider.',
  })
  @ApiParam({
    name: 'id',
    description: 'The unique identifier of the provider.',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'An array of connection summaries.',
    type: [ConnectionSchema],
  })
  @ApiResponse({
    status: 404,
    description: 'Provider not found.',
  })
  list(@Param('id') id: string): ConnectionSchema[] {
    try {
      const provider = this.hubService.validateProvider(id);

      return provider.client.clientOptions.connections.map(
        (c: TokenClientConnection | OAuth2Connection) => ({
          id: c.id,
          description: c.description,
          scopes: (c as OAuth2Connection).scopes ?? undefined,
        }),
      );
    } catch (e: unknown) {
      if (e instanceof NoProviderException) {
        throw new NotFoundException(e.message);
      }
      throw e;
    }
  }

  @Get('/:id/connections/:connection')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Fetch details of a single connection',
    description:
      'Provides complete details about a specific connection under a provider.',
  })
  @ApiParam({ name: 'id', description: 'The provider ID.', type: String })
  @ApiParam({
    name: 'connection',
    description: 'The ID of the specific connection.',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Detailed connection info.',
    type: ConnectionDetailSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Provider or connection not found.',
  })
  async single(
    @Param('id') id: string,
    @Param('connection') connection: string,
  ): Promise<ConnectionDetailSchema> {
    try {
      const provider = this.hubService.validateProvider(id);
      const conn = provider.client.clientOptions.connections.find(
        (c: TokenClientConnection | OAuth2Connection) => c.id === connection,
      );

      if (!conn) {
        throw new NotFoundException(
          `Connection with ID "${connection}" not found for provider "${id}".`,
        );
      }

      let working = false;
      let error = '';

      try {
        working = await this.hubService.testConnection(id, connection);
      } catch (e: unknown) {
        if (e instanceof NotConnectedException) {
          error = e.message;
        } else {
          throw e;
        }
      }

      const { result: oauth2Token } = await this.prisma.oAuth2Token.findFirst({
        where: { provider: id, connection },
        select: {
          access: true,
          scopes: true,
          updatedAt: true,
          createdAt: true,
        },
      });

      const { result: lastActivity } = await this.prisma.activity.findFirst({
        where: {
          resource: 'OAUTH2_TOKEN',
          AND: [
            { resourceId: { path: ['provider'], equals: id } },
            { resourceId: { path: ['connection'], equals: connection } },
          ],
        },
        select: {
          createdAt: true,
          User: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      let connectedUser: Record<string, any> | undefined = undefined;

      if (provider.type !== 'token') {
        try {
          connectedUser = (await provider.client.getUserInfo(
            connection,
          )) as Record<string, any>;
        } catch {
          // Ignored - returning details even if user info fails
        }
      }

      return {
        id: conn.id,
        description: conn.description,
        scopes: (conn as OAuth2Connection).scopes ?? undefined,
        working,
        reason: error || undefined,
        tokenRefreshedAt: oauth2Token?.access
          ? (oauth2Token?.updatedAt ?? oauth2Token.createdAt).toISOString()
          : undefined,
        connectedAt: lastActivity?.createdAt.toISOString() ?? undefined,
        connectedBy: lastActivity?.User,
        connectedUser,
      };
    } catch (e: unknown) {
      if (
        e instanceof NoProviderException ||
        e instanceof NoConnectionException
      ) {
        throw new NotFoundException(e.message);
      }
      throw e;
    }
  }

  @Post('/:id/connections/:connection/test')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Test a provider connection',
    description: 'Checks if a specific connection to a provider is working.',
  })
  @ApiParam({ name: 'id', description: 'The provider ID.', type: String })
  @ApiParam({
    name: 'connection',
    description: 'The connection ID.',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Test result.',
    type: ConnectionTestOutputSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Provider or connection not found.',
  })
  async test(
    @Param('id') id: string,
    @Param('connection') connection: string,
  ): Promise<ConnectionTestOutputSchema> {
    try {
      return {
        working: await this.hubService.testConnection(id, connection),
      };
    } catch (e: unknown) {
      if (
        e instanceof NoProviderException ||
        e instanceof NoConnectionException
      ) {
        throw new NotFoundException(e.message);
      }
      if (e instanceof NotConnectedException) {
        return {
          working: false,
          reason: e.message,
        };
      }
      throw e;
    }
  }

  @Post('/:id/connections/:connection/authorize')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Initiate OAuth2 authorization',
    description: 'Begins the OAuth2 authorization process for a connection.',
  })
  @ApiParam({ name: 'id', description: 'OAuth2 provider ID.', type: String })
  @ApiParam({
    name: 'connection',
    description: 'OAuth2 connection ID.',
    type: String,
  })
  @ApiQuery({
    name: 'scopes',
    description: 'Optional comma-separated OAuth2 scopes.',
    required: false,
    type: String,
  })
  @ApiResponse({
    status: 201,
    description: 'Authorization URL returned.',
    type: ConnectionAuthorizationOutputSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Provider or connection not found.',
  })
  async authorize(
    @Req() req: Request,
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Param('connection') connection: string,
    @Query('scopes') scopes?: string,
  ) {
    try {
      const url = await this.hubService.getAuthorizationUrl(
        id,
        connection,
        scopes ? scopes.split(',').map((s) => s.trim()) : undefined,
      );

      await this.activityService.recordActivity({
        req,
        action: 'CREATE',
        resource: 'OAUTH2_AUTH_STATE',
        resourceId: url.searchParams.get('state') ?? '',
        subAction: 'OAUTH2_INITIATE_AUTHORIZATION',
        userId: auth.user.id,
      });

      return {
        authorizationUrl: url.toString(),
      };
    } catch (e: unknown) {
      if (
        e instanceof NoProviderException ||
        e instanceof NoConnectionException
      ) {
        throw new NotFoundException(e.message);
      }
      throw e;
    }
  }
}

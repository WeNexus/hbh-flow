import { TokenClientConnection, OAuth2Connection } from '#lib/hub/types';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
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
  ConnectionTestOutputSchema,
  AuthorizationOutputSchema,
  ConnectionDetailSchema,
  ConnectionSchema,
} from '../schema';

import {
  NotFoundException,
  Controller,
  Param,
  Query,
  Post,
  Get,
  Req,
} from '@nestjs/common';

@Controller('api/hub/providers')
export class ConnectionController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly hubService: HubService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('/:id/connections')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'List connections for a provider',
    description:
      'This endpoint retrieves a list of connections for a specific provider.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the provider.',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the result of the connection test.',
    type: [ConnectionSchema],
  })
  connections(@Param('id') id: string): ConnectionSchema[] {
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
      throw e; // Re-throw other unexpected errors
    }
  }

  @Get('/:id/connections/:connection')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get connection details',
    description:
      'This endpoint retrieves details for a specific connection of a provider.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the provider.',
    type: String,
  })
  @ApiParam({
    name: 'connection',
    description: 'The connection ID for the provider.',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the details of the connection.',
    type: [ConnectionDetailSchema],
  })
  async getConnection(
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
          `Connection with ID "${id}" not found for provider "${id}".`,
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
          throw e; // Re-throw other unexpected errors
        }
      }

      const oauth2Token = await this.prisma.oAuth2Token.findFirst({
        where: {
          provider: id,
          connection,
        },
        select: {
          access: true,
          scopes: true,
          updatedAt: true,
          createdAt: true,
        },
      });
      const lastActivity = await this.prisma.activity.findFirst({
        where: {
          resource: 'OAUTH2_TOKEN',
          AND: [
            {
              resourceId: {
                path: ['provider'],
                equals: id,
              },
            },
            {
              resourceId: {
                path: ['connection'],
                equals: connection,
              },
            },
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
        orderBy: {
          createdAt: 'desc',
        },
      });

      let connectedUser: Record<string, any> | undefined = undefined;

      if (provider.type !== 'token') {
        try {
          connectedUser = (await provider.client.getUserInfo(
            connection,
          )) as Record<string, any>;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e: unknown) {
          // If getting user info fails, we can still return the connection details
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
        connectedBy: lastActivity ? lastActivity.User : undefined,
        connectedUser,
      };
    } catch (e: unknown) {
      if (
        e instanceof NoProviderException ||
        e instanceof NoConnectionException
      ) {
        throw new NotFoundException(e.message);
      }
      throw e; // Re-throw other unexpected errors
    }
  }

  @Post('/:id/connections/:connection/test')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Test connection',
    description: 'This endpoint tests the connection to a provider.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the provider.',
    type: String,
  })
  @ApiParam({
    name: 'connection',
    description: 'The connection ID for the provider.',
    type: String,
  })
  @ApiResponse({
    status: 404,
    description: 'Provider or connection not found.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the result of the connection test.',
    type: ConnectionTestOutputSchema,
  })
  async testConnection(
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
        // If the connection is not established, we can return false
        return {
          working: false,
          reason: e.message,
        };
      }

      throw e; // Re-throw other unexpected errors
    }
  }

  @Post('/:id/connections/:connection/authorize')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Authorize OAuth2 connection',
    description:
      'This endpoint initiates the OAuth2 authorization flow for a specific provider and connection.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the OAuth2 provider.',
    type: String,
  })
  @ApiParam({
    name: 'connection',
    description: 'The connection ID for the OAuth2 provider.',
    type: String,
  })
  @ApiParam({
    name: 'scopes',
    description: 'Optional scopes to request during authorization.',
    type: String,
    required: false,
  })
  @ApiResponse({
    status: 201,
    description: 'Returns the authorization URL for the OAuth2 connection.',
    type: AuthorizationOutputSchema,
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

      throw e; // Re-throw other unexpected errors
    }
  }
}

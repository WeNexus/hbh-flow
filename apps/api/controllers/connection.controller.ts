import { ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { TokenClientConnection, OAuth2Connection } from '#lib/hub/types';
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
  ConnectionWithProviderSchema,
  ConnectionTestOutputSchema,
  ConnectionDetailSchema,
  ConnectionSchema,
  UserSchema,
} from '../schema';

import {
  NotFoundException,
  Controller,
  Delete,
  Param,
  Query,
  Post,
  Get,
  Req,
} from '@nestjs/common';

@Controller('api')
export class ConnectionController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly hubService: HubService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('/connections')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'List all connections across all providers',
    description:
      'Returns a list of all available connections configured across all providers.',
  })
  @ApiResponse({
    status: 200,
    description: 'An array of connection summaries.',
    type: [ConnectionWithProviderSchema],
  })
  async listAll(): Promise<ConnectionWithProviderSchema[]> {
    const connections: ConnectionWithProviderSchema[] = [];

    const { result: dbConnections } =
      await this.prisma.connectionStatus.findMany({
        where: {
          provider: {
            in: this.hubService.providersArray.map(
              (p) => p.client.clientOptions.id,
            ),
          },
        },
      });

    for (const provider of this.hubService.providersArray) {
      const clientOptions = provider.client.clientOptions;

      for (const c of clientOptions.connections) {
        const dbConnection = dbConnections.find(
          (dc) => dc.provider === clientOptions.id && dc.connection === c.id,
        );

        const connectedBy = await this.getConnectedByUser(
          provider.client.clientOptions.id,
          c.id,
        );

        connections.push({
          ...c,
          provider: {
            id: clientOptions.id,
            type: provider.type,
            name: clientOptions.name,
            icon: clientOptions.icon,
          },
          working: dbConnection?.working ?? false,
          reason: dbConnection?.reason ?? undefined,
          testedAt: dbConnection?.testedAt ?? undefined,
          connectedBy: connectedBy?.user,
        });
      }
    }

    return connections;
  }

  @Get('/providers/:id/connections')
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
  async list(@Param('id') id: string): Promise<ConnectionSchema[]> {
    try {
      const provider = this.hubService.validateProvider(id);
      const { result: dbConnections } =
        await this.prisma.connectionStatus.findMany({
          where: {
            provider: provider.client.clientOptions.id,
          },
        });

      return Promise.all(
        provider.client.clientOptions.connections.map(
          async (c: TokenClientConnection | OAuth2Connection) => {
            const dbConnection = dbConnections.find(
              (dc) => dc.connection === c.id,
            );

            const connectedBy = await this.getConnectedByUser(
              provider.client.clientOptions.id,
              c.id,
            );

            return {
              id: c.id,
              description: c.description,
              scopes: (c as OAuth2Connection).scopes ?? undefined,
              working: dbConnection?.working ?? false,
              reason: dbConnection?.reason ?? undefined,
              testedAt: dbConnection?.testedAt ?? undefined,
              connectedBy: connectedBy?.user,
            };
          },
        ),
      );
    } catch (e: unknown) {
      if (e instanceof NoProviderException) {
        throw new NotFoundException(e.message);
      }
      throw e;
    }
  }

  @Get('/providers/:id/connections/:connection')
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

      let connectedUser: Record<string, any> | undefined = undefined;
      let connectedAt: Date | undefined = undefined;
      let connectedBy: UserSchema | undefined;

      if (provider.type !== 'token') {
        try {
          connectedUser = (await provider.client.getUserInfo(
            connection,
          )) as Record<string, any>;
          const result = await this.getConnectedByUser(id, connection);
          connectedBy = result?.user;
          connectedAt = result?.connectedAt;
        } catch {
          // Ignored - returning details even if user info fails
        }
      } else {
        connectedBy = (
          await this.prisma.user.findFirstOrThrow({
            where: {
              id: 1,
            },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              createdAt: true,
              updatedAt: true,
            },
            cache: {
              key: 'system-user',
            },
          })
        ).result;
      }

      return {
        id: conn.id,
        description: conn.description,
        scopes: (conn as OAuth2Connection).scopes ?? undefined,
        working,
        reason: error || undefined,
        testedAt: new Date(),
        tokenRefreshedAt: oauth2Token?.access
          ? (oauth2Token?.updatedAt ?? oauth2Token.createdAt).toISOString()
          : undefined,
        connectedAt: connectedAt?.toISOString(),
        connectedBy,
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

  @Delete('/providers/:id/connections/:connection')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Disconnect a connection',
    description: 'Disconnects an OAuth2 connection from the provider.',
  })
  @ApiParam({ name: 'id', description: 'Provider ID.', type: String })
  @ApiParam({
    name: 'connection',
    description: 'Connection ID to disconnect.',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Connection successfully disconnected.',
  })
  @ApiResponse({
    status: 404,
    description: 'Provider or connection not found.',
  })
  async disconnect(
    @Req() req: Request,
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Param('connection') connection: string,
  ) {
    try {
      await this.hubService.disconnect(id, connection);

      await this.activityService.recordActivity({
        req,
        action: 'DELETE',
        resource: 'OAUTH2_TOKEN',
        resourceId: { provider: id, connection },
        subAction: 'OAUTH2_DISCONNECT',
        userId: auth.user.id,
      });

      return { message: 'Connection successfully disconnected.' };
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

  @Post('/providers/:id/connections/:connection/test')
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
      if (e instanceof Error) {
        return {
          working: false,
          reason: e.message,
        };
      }

      throw e;
    }
  }

  @Post('/providers/:id/connections/:connection/authorize')
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

  private async getConnectedByUser(id: string, connection: string) {
    const provider = this.hubService.validateProvider(id);

    if (provider.type === 'token') {
      const { result: systemUser } = await this.prisma.user.findUniqueOrThrow({
        where: { id: 1 },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
        cache: {
          key: 'system-user',
        },
      });

      return {
        user: systemUser,
        connectedAt: new Date(),
      };
    }

    const { result: activity } = await this.prisma.activity.findFirst({
      where: {
        resource: 'OAUTH2_TOKEN',
        subAction: {
          in: ['OAUTH2_AUTHORIZATION', 'OAUTH2_DISCONNECT'],
        },
        AND: [
          { resourceId: { path: ['provider'], equals: id } },
          { resourceId: { path: ['connection'], equals: connection } },
        ],
      },
      select: {
        createdAt: true,
        subAction: true,
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

    if (activity?.subAction === 'OAUTH2_AUTHORIZATION' && activity?.User) {
      return {
        user: activity.User,
        connectedAt: activity.createdAt,
      };
    }

    return null;
  }
}

import { ProviderListOutputSchema, ProviderDetailSchema } from '../schema';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Auth, Protected } from '#lib/auth/decorators';
import { ActivityService } from '#lib/core/services';
import { PaginationSchema } from '#lib/core/schema';
import type { AuthContext } from '#lib/auth/types';
import { HubService } from '#lib/hub/hub.service';
import type { Request } from 'express';
import * as arctic from 'arctic';

import {
  TokenClientConnection,
  OAuth2ClientOptions,
  OAuth2Connection,
} from '#lib/hub/types';

import {
  NoConnectionException,
  NoProviderException,
  NoStateException,
} from '#lib/hub/exceptions';

import {
  NotFoundException,
  Controller,
  Param,
  Query,
  Get,
  Req,
} from '@nestjs/common';

@Controller('api/hub')
export class HubController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly hubService: HubService,
  ) {}

  @Get('/providers')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'List all providers',
    description: 'This endpoint retrieves a list of all registered providers.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the provider.',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns a list of providers.',
    type: ProviderListOutputSchema,
  })
  getProviders(@Query() input: PaginationSchema): ProviderListOutputSchema {
    const { page = 1, limit = 25 } = input;
    const count = this.hubService.providers.size;

    const result: ProviderListOutputSchema = {
      count,
      page,
      limit,
      pages: Math.ceil(count / limit),
      hasNext: page * limit < count,
      hasPrev: page > 1,
      data: [],
    };

    for (const provider of this.hubService.providersArray.slice(
      (page - 1) * limit,
      page * limit,
    )) {
      const options = provider.client.clientOptions;

      result.data.push({
        id: options.id,
        type: provider.type,
        name: options.name,
        icon: options.icon,
      });
    }

    return result;
  }

  @Get('/providers/:id')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get provider details',
    description:
      'This endpoint retrieves details for a specific provider by ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the provider.',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the details of the provider.',
    type: ProviderDetailSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Provider not found.',
  })
  getProvider(@Param('id') id: string): ProviderDetailSchema {
    try {
      const provider = this.hubService.validateProvider(id);

      return {
        id: provider.client.clientOptions.id,
        type: provider.type,
        name: provider.client.clientOptions.name,
        icon: provider.client.clientOptions.icon,
        scopes: (provider.options as OAuth2ClientOptions).scopes ?? [],
        connections: provider.client.clientOptions.connections.map(
          (c: TokenClientConnection | OAuth2Connection) => ({
            id: c.id,
            description: c.description,
            scopes: (c as OAuth2Connection).scopes ?? undefined,
          }),
        ),
      };

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      throw new NotFoundException(`Provider with ID "${id}" not found.`);
    }
  }

  @Get('/callback')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'OAuth2 callback handler',
    description:
      'This endpoint handles the OAuth2 callback after the user has authorized the application.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns a message indicating success.',
  })
  @ApiResponse({
    status: 404,
    description: 'No provider, connection, or state found.',
  })
  @ApiResponse({
    status: 422,
    description: 'Failed to get tokens.',
  })
  async callback(
    @Req() req: Request,
    @Auth() auth: AuthContext,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    try {
      const { dbTokens } = await this.hubService.handleCallback(state, code);

      await this.activityService.recordActivity({
        req,
        action: 'CREATE',
        resource: 'OAUTH2_TOKEN',
        resourceId: {
          provider: dbTokens.provider,
          connection: dbTokens.connection,
        },
        subAction: 'OAUTH2_AUTHORIZATION',
        userId: auth.user.id,
      });

      return `
      <h1 style="margin-left: auto; margin-right: auto;">
        Connection successful! You can close this window now.
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
      <h1 style="margin-left: auto; margin-right: auto;">
        ${e.message}.
      </h1>
        `;
      }

      throw e; // Re-throw other unexpected errors
    }
  }
}

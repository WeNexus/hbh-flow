import { ProviderListOutputSchema, ProviderDetailSchema } from '../schema';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { PaginationSchema } from '#lib/core/schema';
import { HubService } from '#lib/hub/hub.service';
import { Protected } from '#lib/auth/decorators';

import {
  TokenClientConnection,
  OAuth2ClientOptions,
  OAuth2Connection,
} from '#lib/hub/types';

import {
  NotFoundException,
  Controller,
  Param,
  Query,
  Get,
} from '@nestjs/common';

@Controller('api/providers')
export class ProviderController {
  constructor(private readonly hubService: HubService) {}

  @Get('/')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'List all providers',
    description:
      'Retrieves a paginated list of all registered integration providers.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully returned the list of providers.',
    type: ProviderListOutputSchema,
  })
  providers(@Query() input: PaginationSchema): ProviderListOutputSchema {
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

  @Get('/:id')
  @Protected('OBSERVER')
  @ApiOperation({
    summary: 'Get provider details',
    description:
      'Fetches detailed information for a specific provider by its ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'The unique identifier of the provider to retrieve.',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Provider details retrieved successfully.',
    type: ProviderDetailSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Provider not found.',
  })
  singleProvider(@Param('id') id: string): ProviderDetailSchema {
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
    } catch (e) {
      throw new NotFoundException(`No provider found with ID "${id}".`);
    }
  }
}

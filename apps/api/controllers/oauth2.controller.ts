import { AuthorizationOutputSchema } from '../schema/authorization-output.schema';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { HubService } from '../../../libs/hub/hub.service';
import { Protected } from '#lib/auth/decorators';
import * as arctic from 'arctic';

import {
  NoConnectionException,
  NoProviderException,
  NoStateException,
} from '../../../libs/hub/exceptions';

import {
  NotFoundException,
  Controller,
  Param,
  Query,
  Post,
  Get,
} from '@nestjs/common';

@Controller('api/hub')
export class OAuth2Controller {
  constructor(private readonly oauth2Service: HubService) {}

  @Post('/:id/:connection/authorize')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Authorize OAuth2 connection',
    description:
      'This endpoint initiates the OAuth2 authorization flow for a specific provider and connection.',
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
  async authorize(
    @Param('id') id: string,
    @Param('connection') connection: string,
    @Query('scopes') scopes?: string,
  ) {
    try {
      const url = await this.oauth2Service.getAuthorizationUrl(
        id,
        connection,
        scopes ? scopes.split(',').map((s) => s.trim()) : undefined,
      );

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
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string) {
    try {
      await this.oauth2Service.handleCallback(state, code);
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

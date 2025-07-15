import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { GlobalEventService, PrismaService } from '#lib/core/services';
import { NoProviderException, NoStateException } from './exceptions';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { OAuth2ClientOptions } from '#lib/oauth2/types';
import { OAuth2Client } from '#lib/oauth2/clients';
import { OnEvent } from '@nestjs/event-emitter';
import { OAuth2Token } from '@prisma/client';
import type { Jsonify } from 'type-fest';
import * as arctic from 'arctic';

/**
 * Service for managing OAuth2 clients and tokens.
 * This service provides methods to get authorization URLs, handle callbacks,
 * retrieve access tokens, and refresh tokens.
 */

@Injectable()
export class OAuth2Service implements OnApplicationBootstrap {
  constructor(
    private readonly globalEventService: GlobalEventService,
    private readonly discoveryService: DiscoveryService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  private readonly providers = new Map<string, InstanceWrapper<OAuth2Client>>();

  /**
   * @internal
   */
  onApplicationBootstrap() {
    for (const provider of this.discoveryService.getProviders()) {
      if (!provider.metatype) {
        continue;
      }

      const metadata = this.reflector.get<OAuth2ClientOptions>(
        'HBH_OAUTH2_CLIENT',
        provider.metatype,
      );

      if (!metadata) {
        continue;
      }

      this.providers.set(
        metadata.id,
        provider as InstanceWrapper<OAuth2Client>,
      );
    }
  }

  @OnEvent('global.oauth2.refresh')
  protected handleTokenRefresh(payload: Jsonify<OAuth2Token>) {
    const provider = this.validateProvider(payload.provider);

    // Update cache
    provider.instance.tokens.set(
      payload.connection,
      provider.instance.deSerializeToken(payload),
    );
  }

  private validateProvider(id: string) {
    const provider = this.providers.get(id);

    if (!provider) {
      throw new NoProviderException(
        `OAuth2 provider with id "${id}" not found.`,
      );
    }

    return provider;
  }

  /**
   * Generates an authorization URL for the specified OAuth2 provider and connection.
   *
   * @param id - The ID of the OAuth2 provider.
   * @param connection - The ID of the connection to use.
   * @param scopes - Optional array of scopes to request. If not provided, defaults to the connection's and provider's scopes.
   * @returns The authorization URL to redirect the user to for authentication.
   */
  async getAuthorizationUrl(
    id: string,
    connection: string,
    scopes?: string[],
  ): Promise<URL> {
    return this.validateProvider(id).instance.getAuthorizationUrl(
      connection,
      scopes,
    );
  }

  /**
   * Handles the OAuth2 callback and exchanges the authorization code for tokens.
   *
   * @param state - The state parameter from the OAuth2 callback.
   * @param code - The authorization code received from the OAuth2 provider.
   * @returns The OAuth2 tokens received from the provider.
   */
  async handleCallback(
    state: string,
    code: string,
  ): Promise<arctic.OAuth2Tokens> {
    const oauth2State = await this.prisma.oAuth2AuthState.findFirst({
      where: {
        state,
      },
      select: {
        provider: true,
        connection: true,
        verifier: true,
      },
    });

    if (!oauth2State) {
      throw new NoStateException(
        `OAuth2 connection with state "${state}" not found.`,
      );
    }

    const provider = this.validateProvider(oauth2State.provider);
    const arcticClient = provider.instance.validateConnection(
      oauth2State.connection,
    );

    const connectionOptions = provider.instance.clientOptions.connections.find(
      (conn) => conn.id === oauth2State.connection,
    );

    // this may throw an error, so it should be handled by the caller
    const tokens = await arcticClient.validateAuthorizationCode(
      connectionOptions!.tokenURL,
      code,
      oauth2State.verifier,
    );

    // update the connection with the new tokens
    const token = await this.prisma.oAuth2Token.upsert({
      where: {
        provider_connection: {
          provider: oauth2State.provider,
          connection: oauth2State.connection,
        },
      },
      create: {
        provider: oauth2State.provider,
        connection: oauth2State.connection,
        access: tokens.accessToken(),
        refresh: tokens.refreshToken(),
        expiresAt: tokens.accessTokenExpiresAt(),
        scopes: tokens.scopes().length ? tokens.scopes() : undefined,
      },
      update: {
        access: tokens.accessToken(),
        refresh: tokens.refreshToken(),
        expiresAt: tokens.accessTokenExpiresAt(),
        scopes: tokens.scopes().length ? tokens.scopes() : undefined,
      },
    });

    this.globalEventService.emit<OAuth2Token>('global.oauth2.refresh', token);

    return tokens;
  }

  /**
   * Retrieves the access token for the specified OAuth2 provider and connection.
   *
   * @param id - The ID of the OAuth2 provider.
   * @param connection - The ID of the connection to use.
   * @returns The access token for the specified provider and connection.
   */
  async getAccessToken(id: string, connection: string): Promise<OAuth2Token> {
    return this.validateProvider(id).instance.getToken(connection);
  }

  /**
   * Refreshes the access and refresh tokens for the specified OAuth2 provider and connection.
   *
   * @param id - The ID of the OAuth2 provider.
   * @param connection - The ID of the connection to use.
   * @returns The updated OAuth2 token.
   */
  async refreshTokens(id: string, connection: string) {
    return this.validateProvider(id).instance.refreshToken(connection);
  }
}

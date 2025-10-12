import { OAuth2ClientOptions, TokenClientOptions, ClientType } from './types';
import { GlobalEventService, PrismaService } from '#lib/core/services';
import { NoProviderException, NoStateException } from './exceptions';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import type { GlobalEventPayload } from '#lib/core/types';
import { OAuth2Client, TokenClient } from './clients';
import { OnEvent } from '@nestjs/event-emitter';
import { OAuth2Token } from '@prisma/client';

/**
 * Service for managing OAuth2 clients and Token Clients.
 * This service provides methods to get authorization URLs, handle callbacks,
 * retrieve access tokens, and refresh tokens.
 */

@Injectable()
export class HubService implements OnApplicationBootstrap {
  constructor(
    private readonly globalEventService: GlobalEventService,
    private readonly discoveryService: DiscoveryService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  public readonly providers = new Map<
    string,
    | {
        type: 'oauth2';
        options: OAuth2ClientOptions;
        client: OAuth2Client;
      }
    | {
        type: 'token';
        options: TokenClientOptions;
        client: TokenClient;
      }
  >();

  public readonly providersArray: {
    type: ClientType;
    options: OAuth2ClientOptions | TokenClientOptions;
    client: OAuth2Client | TokenClient;
  }[] = [];

  /**
   * @internal
   */
  onApplicationBootstrap() {
    for (const provider of this.discoveryService.getProviders()) {
      if (!provider.metatype) {
        continue;
      }

      const metadata = this.reflector.get<
        OAuth2ClientOptions | TokenClientOptions
      >('HBH_HUB_CLIENT', provider.metatype);

      if (!metadata) {
        continue;
      }

      const type = this.reflector.get<ClientType>(
        'HBH_HUB_CLIENT_TYPE',
        provider.metatype,
      );

      const client = provider.instance as OAuth2Client | TokenClient;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      this.providers.set(metadata.id, {
        type,
        options: client.clientOptions,
        client,
      } as any);

      this.providersArray.push({
        type,
        options: client.clientOptions,
        client,
      });
    }
  }

  @OnEvent('global.hub.refresh')
  protected handleTokenRefresh({
    data: payload,
  }: GlobalEventPayload<OAuth2Token>) {
    const provider = this.validateProvider(payload.provider);

    if (provider.type !== 'oauth2') {
      throw new NoProviderException(
        `Provider "${payload.provider}" is not an OAuth2 provider.`,
      );
    }

    // Update cache
    provider.client.tokens.set(
      payload.connection,
      provider.client.deSerializeToken(payload),
    );
  }

  /**
   * Validates the existence of a provider by its ID.
   *
   * @param id - The ID of the provider to validate.
   * @returns The client associated with the provider if it exists.
   * @throws NoProviderException if the provider with the given ID does not exist.
   */
  public validateProvider(id: string) {
    const client = this.providers.get(id);

    if (!client) {
      throw new NoProviderException(
        `OAuth2 provider with id "${id}" not found.`,
      );
    }

    return client;
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
    const provider = this.validateProvider(id);

    if (provider.type !== 'oauth2') {
      throw new NoProviderException(
        `Provider "${id}" is not an OAuth2 provider.`,
      );
    }

    return provider.client.getAuthorizationUrl(connection, scopes);
  }

  /**
   * Handles the OAuth2 callback and exchanges the authorization code for tokens.
   *
   * @param state - The state parameter from the OAuth2 callback.
   * @param code - The authorization code received from the OAuth2 provider.
   * @returns An object containing the tokens and the connection information.
   */
  async handleCallback(state: string, code: string) {
    const { result: oauth2State } = await this.prisma.oAuth2AuthState.findFirst(
      {
        where: {
          state,
        },
        select: {
          provider: true,
          connection: true,
          verifier: true,
        },
      },
    );

    if (!oauth2State) {
      throw new NoStateException(
        `OAuth2 connection with state "${state}" not found.`,
      );
    }

    const provider = this.validateProvider(oauth2State.provider);

    if (provider.type !== 'oauth2') {
      throw new NoProviderException(
        `Provider "${oauth2State.provider}" is not an OAuth2 provider.`,
      );
    }

    const arcticClient = provider.client.validateConnection(
      oauth2State.connection,
    );

    const connectionOptions = provider.client.clientOptions.connections.find(
      (conn) => conn.id === oauth2State.connection,
    );

    // this may throw an error, so it should be handled by the caller
    const arcticTokens = await arcticClient.validateAuthorizationCode(
      connectionOptions!.tokenURL,
      code,
      oauth2State.verifier,
    );

    // update the connection with the new tokens
    const { result: dbTokens } = await this.prisma.oAuth2Token.upsert({
      where: {
        provider_connection: {
          provider: oauth2State.provider,
          connection: oauth2State.connection,
        },
      },
      create: {
        provider: oauth2State.provider,
        connection: oauth2State.connection,
        access: arcticTokens.accessToken(),
        refresh: arcticTokens.hasRefreshToken()
          ? arcticTokens.refreshToken()
          : null,
        expiresAt: arcticTokens.hasExpiry()
          ? arcticTokens.accessTokenExpiresAt()
          : null,
        scopes: arcticTokens.hasScopes() ? arcticTokens.scopes() : undefined,
      },
      update: {
        access: arcticTokens.accessToken(),
        refresh: arcticTokens.hasRefreshToken()
          ? arcticTokens.refreshToken()
          : null,
        expiresAt: arcticTokens.hasExpiry()
          ? arcticTokens.accessTokenExpiresAt()
          : null,
        scopes: arcticTokens.hasScopes() ? arcticTokens.scopes() : undefined,
      },
    });

    this.globalEventService.emit<OAuth2Token>('global.hub.refresh', dbTokens);

    // Test the connection to ensure it's valid
    await this.testConnection(oauth2State.provider, oauth2State.connection);

    return {
      arcticTokens,
      dbTokens,
    };
  }

  /**
   * Retrieves tokens for the specified provider and connection.
   *
   * @param id - The ID of the provider.
   * @param connection - The ID of the connection to use.
   * @returns The tokens for the specified provider and connection.
   */
  async getTokens(
    id: string,
    connection: string,
  ): Promise<OAuth2Token | Record<string, string>> {
    return this.validateProvider(id).client.getToken(connection);
  }

  /**
   * Refreshes the access and refresh tokens for the specified OAuth2 provider and connection.
   *
   * @param id - The ID of the OAuth2 provider.
   * @param connection - The ID of the connection to use.
   * @returns The updated OAuth2 token.
   */
  async refreshTokens(id: string, connection: string) {
    const provider = this.validateProvider(id);

    if (provider.type !== 'oauth2') {
      throw new NoProviderException(
        `Provider "${id}" is not an OAuth2 provider.`,
      );
    }

    return provider.client.refreshToken(connection);
  }

  /**
   * Tests the connection to a provider.
   *
   * @param id - The ID of the provider.
   * @param connection - The connection ID for the provider.
   * @returns A boolean indicating whether the connection is valid.
   */
  async testConnection(id: string, connection: string): Promise<boolean> {
    const provider = this.validateProvider(id);
    let working = false;
    let error: Error | null = null;

    if (provider.type === 'oauth2') {
      try {
        const user: unknown = await provider.client.getUserInfo(connection);
        working = !!user;
      } catch (e) {
        if (e instanceof Error) {
          error = e;
        }
      }
    } else {
      try {
        working = await provider.client.testConnection(connection);
      } catch (e: unknown) {
        if (e instanceof Error) {
          error = e;
        }
      }
    }

    await this.prisma.connectionStatus.upsert({
      where: {
        provider_connection: {
          provider: id,
          connection: connection,
        },
      },
      update: {
        working,
        testedAt: new Date(),
        reason: error ? error.message : null,
      },
      create: {
        working,
        provider: id,
        connection: connection,
        testedAt: new Date(),
        reason: error ? error.message : null,
      },
    });

    if (error) {
      throw error;
    }

    return working;
  }

  /**
   * Disconnects a connection from an OAuth2 provider.
   *
   * @param id - The ID of the OAuth2 provider.
   * @param connection - The ID of the connection to disconnect.
   * @throws NoProviderException if the provider is not an OAuth2 provider.
   */
  async disconnect(id: string, connection: string) {
    const provider = this.validateProvider(id);

    if (provider.type !== 'oauth2') {
      throw new NoProviderException(
        `Provider "${id}" is not an OAuth2 provider.`,
      );
    }

    // Remove the tokens from the database
    await this.prisma.oAuth2Token.deleteMany({
      where: {
        provider: id,
        connection: connection,
      },
    });

    // Remove the connection status
    await this.prisma.connectionStatus.deleteMany({
      where: {
        provider: id,
        connection: connection,
      },
    });

    // Remove the auth state
    await this.prisma.oAuth2AuthState.deleteMany({
      where: {
        provider: id,
        connection: connection,
      },
    });

    // Remove the tokens from the client cache
    provider.client.tokens.delete(connection);
  }
}

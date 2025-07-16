import { GlobalEventService, PrismaService } from '#lib/core/services';
import { WorkflowService } from '#lib/workflow/workflow.service';
import { OAuth2Client as ArcticClient } from 'arctic';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Jsonify, SetRequired } from 'type-fest';
import { TokenRefreshWorkflow } from '../misc';
import { OAuth2ClientOptions } from '../types';
import { OAuth2Token } from '@prisma/client';
import { EnvService } from '#lib/core/env';
import { ModuleRef } from '@nestjs/core';
import * as arctic from 'arctic';

import {
  TokenRefreshFailedException,
  NoConnectionException,
  NotConnectedException,
} from '../exceptions';

type Options = SetRequired<
  OAuth2ClientOptions,
  'clientId' | 'clientSecret' | 'connections'
>;

/**
 * Base class for OAuth2 clients.
 * This class should be extended by specific OAuth2 clients.
 */
export abstract class OAuth2Client {
  protected constructor(
    private readonly moduleRef: ModuleRef,
    public readonly clientOptions: Options,
    private readonly env: EnvService,
  ) {
    const url = new URL(this.env.getString('APP_URL'));
    const basePath = url.pathname.endsWith('/') ? '' : url.pathname;
    url.pathname = `${basePath}/api/oauth2/callback`;

    // Initialize Arctic clients for each connection.
    for (const connection of this.clientOptions.connections) {
      this.arcticClients.set(
        connection.id,
        new ArcticClient(
          this.clientOptions.clientId,
          this.clientOptions.clientSecret,
          url.toString(),
        ),
      );
    }
  }

  /**
   * Map of Arctic clients keyed by connection ID.
   * Each client is initialized with the provided clientId and clientSecret, token URL, etc.
   */
  public readonly arcticClients = new Map<string, ArcticClient>();
  public readonly tokens = new Map<string, OAuth2Token>();

  /**
   * Check if the client is connected to a specific connection.
   * This method should be implemented by subclasses to check the connection status.
   *
   * @param connection - The connection to check.
   */
  abstract getUserInfo(connection: string): Promise<any>;

  /**
   * Deserializes an OAuth2 token from the database format to the internal format.
   * This method converts date strings to Date objects for fields like `expiresAt`, `createdAt`, and `updatedAt`.
   *
   * @param token - The serialized OAuth2 token from the database.
   * @returns The deserialized OAuth2 token with Date objects for date fields.
   */
  deSerializeToken(token: Jsonify<OAuth2Token>): OAuth2Token {
    const result = {} as OAuth2Token;

    for (const key of Object.keys(token)) {
      if (
        (key === 'expiresAt' || key === 'createdAt' || key === 'updatedAt') &&
        typeof token[key] === 'string'
      ) {
        result[key] = new Date(token[key]);
      } else {
        result[key] = token[key] as OAuth2Token[keyof OAuth2Token];
      }
    }

    return result;
  }

  /**
   * Validates the connection ID and returns the corresponding Arctic client.
   * Throws an exception if the connection is not found.
   *
   * @param connection - The ID of the connection to validate.
   * @returns The Arctic client for the specified connection.
   */
  validateConnection(connection: string) {
    const arcticClient = this.arcticClients.get(connection);

    if (!arcticClient) {
      throw new NoConnectionException(
        `OAuth2 connection "${connection}" for provider "${this.clientOptions.id}" not found.`,
      );
    }

    return arcticClient;
  }

  /**
   * Generates an authorization URL for the specified connection.
   *
   * @param connection - The ID of the connection to use.
   * @param scopes - Optional array of scopes to request. If not provided, defaults to the connection's and provider's scopes.
   * @returns The authorization URL to redirect the user to for authentication.
   */
  async getAuthorizationUrl(
    connection: string,
    scopes?: string[],
  ): Promise<URL> {
    const arcticClient = this.validateConnection(connection);

    const connectionOptions = this.clientOptions.connections.find(
      (conn) => conn.id === connection,
    )!;

    const state = arctic.generateState();
    const verifier = arctic.generateCodeVerifier();

    // ensure scopes are unique and combine them
    const _scopes = Array.from(
      new Set([
        ...(connectionOptions.scopes ?? []),
        ...(this.clientOptions.scopes ?? []),
        ...(scopes ?? []),
      ]),
    );

    // each connection can have only one entry in the database
    await this.moduleRef
      .get(PrismaService, { strict: false })
      .oAuth2AuthState.create({
        data: {
          provider: this.clientOptions.id,
          connection,
          verifier,
          state,
        },
        select: {
          connection: true,
        },
      });

    const url = arcticClient.createAuthorizationURLWithPKCE(
      connectionOptions.authorizationURL,
      state,
      arctic.CodeChallengeMethod.S256,
      verifier,
      _scopes,
    );

    // set access_type as offline to get refresh tokens
    url.searchParams.set('access_type', 'offline');
    return url;
  }

  /**
   * Retrieves the OAuth2Token row for the specified connection.
   * If the token is expired or will expire soon, it will refresh the token.
   *
   * @param connection - The ID of the connection.
   * @returns The token for the specified connection.
   */
  async getToken(connection: string): Promise<OAuth2Token> {
    this.validateConnection(connection);

    let token: OAuth2Token;

    if (!this.tokens.has(connection)) {
      const _token = await this.moduleRef
        .get(PrismaService, { strict: false })
        .oAuth2Token.findFirstOrThrow({
          where: {
            provider: this.clientOptions.id,
            connection,
          },
        });

      if (!_token) {
        throw new NotConnectedException(
          `OAuth2 connection "${connection}" for provider "${this.clientOptions.name}" not established.`,
        );
      }

      token = _token;
      this.tokens.set(connection, _token);
    } else {
      token = this.tokens.get(connection)!;
    }

    // Check if the token is expired or will expire in less than 10 minutes
    const shouldRefresh =
      token.expiresAt <= new Date() ||
      token.expiresAt <= new Date(Date.now() + 10 * 60 * 1000);

    if (!shouldRefresh) {
      return token;
    }

    return new Promise<OAuth2Token>((resolve, reject) => {
      const listener = (data: Jsonify<OAuth2Token>) => {
        const token = this.deSerializeToken(data);

        this.tokens.set(connection, token);
        resolve(token);
      };
      const failedListener = (e?: Error) => {
        this.moduleRef
          .get(EventEmitter2, { strict: false })
          .off('global.hub.refresh', listener);
        clearTimeout(timeoutId);
        reject(new TokenRefreshFailedException(e?.message));
      };

      const timeoutId = setTimeout(failedListener, 5000000); // 10 seconds timeout
      this.moduleRef
        .get(EventEmitter2, { strict: false })
        .once('global.hub.refresh', listener);

      // Trigger the token refresh workflow
      this.moduleRef
        .get(WorkflowService, { strict: false })
        .run(TokenRefreshWorkflow, {
          deduplication: {
            id: 'hub:refresh',
          },
          payload: {
            provider: this.clientOptions.id,
            connection,
          },
        })
        .catch(failedListener);
    });
  }

  /**
   * Refreshes the access and refresh tokens for the specified connection.
   *
   * @param connection - The ID of the connection.
   * @returns The updated OAuth2 token.
   */
  async refreshToken(connection: string) {
    const id = this.clientOptions.id;
    const arcticClient = this.validateConnection(connection);

    let token = await this.moduleRef
      .get(PrismaService, { strict: false })
      .oAuth2Token.findFirst({
        where: {
          provider: id,
          connection,
        },
      });

    if (!token) {
      throw new NotConnectedException(
        `OAuth2 connection "${connection}" for provider "${id}" not established.`,
      );
    }

    // refresh the token
    const connectionOption = this.clientOptions.connections.find(
      (conn) => conn.id === connection,
    )!;

    const tokens = await arcticClient.refreshAccessToken(
      connectionOption.tokenURL,
      token.refresh,
      token.scopes,
    );

    if (!tokens.hasRefreshToken()) {
      (tokens.data as Record<string, any>).refresh_token = token.refresh;
    }

    if (!tokens.hasScopes()) {
      (tokens.data as Record<string, any>).scope = token.scopes.join(' ');
    }

    // update the connection with the new tokens
    token = await this.moduleRef
      .get(PrismaService, { strict: false })
      .oAuth2Token.update({
        where: {
          provider_connection: {
            provider: id,
            connection,
          },
        },
        data: {
          access: tokens.accessToken(),
          refresh: tokens.refreshToken(),
          expiresAt: tokens.accessTokenExpiresAt(),
        },
      });

    this.moduleRef
      .get(GlobalEventService, { strict: false })
      .emit<OAuth2Token>('global.hub.refresh', token);

    return token;
  }
}

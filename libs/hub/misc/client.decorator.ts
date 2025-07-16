import { ClientType, OAuth2ClientOptions, TokenClientOptions } from '../types';
import { applyDecorators, SetMetadata, Injectable } from '@nestjs/common';

/**
 * Decorator to mark a class as an OAuth2 or Token client with specific options.
 * Additionally, it makes the class injectable in the NestJS dependency injection system.
 *
 * @param type - The type of client, either OAuth2 or Token.
 * @param options - The configuration options for the client.
 * @returns A class decorator that applies metadata and makes the class injectable.
 */
export function Client<T extends ClientType = ClientType>(
  type: T,
  options: T extends 'oauth2' ? OAuth2ClientOptions : TokenClientOptions,
) {
  return applyDecorators(
    Injectable(),
    SetMetadata(
      type === 'oauth2' ? 'HBH_OAUTH2_CLIENT' : 'HBH_TOKEN_CLIENT',
      options,
    ),
  );
}

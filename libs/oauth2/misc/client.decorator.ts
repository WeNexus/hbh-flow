import { applyDecorators, SetMetadata, Injectable } from '@nestjs/common';
import { OAuth2ClientOptions } from '#lib/oauth2/types';

/**
 * Decorator to mark a class as an OAuth2 client with specific options.
 * Additionally, it makes the class injectable in the NestJS dependency injection system.
 *
 * @param options - The configuration options for the OAuth2 client.
 * @returns A class decorator that applies metadata and makes the class injectable.
 */
export function Client(options: OAuth2ClientOptions) {
  return applyDecorators(
    Injectable(),
    SetMetadata('HBH_OAUTH2_CLIENT', options),
  );
}

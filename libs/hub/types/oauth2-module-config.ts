import { OAuth2ClientOptions } from './oauth2-client-options';
import { ModuleMetadata } from '@nestjs/common';

/**
 * Configuration interface for the OAuth2 module.
 * This interface defines the structure of the configuration object
 * that can be used to initialize the OAuth2 module.
 */
export interface OAuth2ModuleConfig extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (
    ...args: any[]
  ) => Partial<OAuth2ClientOptions> | Promise<Partial<OAuth2ClientOptions>>;
  inject?: any[];
}

import { TokenClientOptions } from './token-client-options';
import { ModuleMetadata } from '@nestjs/common';

/**
 * Configuration interface for the token based provider modules.
 * This interface defines the structure of the configuration object
 * that can be used to initialize the Token module.
 */
export interface TokenModuleConfig extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (
    ...args: any[]
  ) => Partial<TokenClientOptions> | Promise<Partial<TokenClientOptions>>;
  inject?: any[];
}

import { OAUTH2_CLIENT_OPTIONS } from '#lib/oauth2/misc';
import { OAuth2ModuleConfig } from '#lib/oauth2/types';
import { DynamicModule } from '@nestjs/common';
import { ZohoService } from './zoho.service';

export class ZohoModule {
  static forRoot(options: OAuth2ModuleConfig): DynamicModule {
    return {
      module: ZohoModule,
      providers: [
        {
          provide: OAUTH2_CLIENT_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject,
        },
        ZohoService,
      ],
      exports: [ZohoService],
    };
  }
}

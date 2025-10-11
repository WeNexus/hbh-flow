import { DynamicModule, Module } from '@nestjs/common';
import { OAUTH2_CLIENT_OPTIONS } from '#lib/hub/misc';
import { ZohoService } from '#lib/zoho/zoho.service';
import { OAuth2ModuleConfig } from '#lib/hub/types';
import { MondayService } from './monday.service';

@Module({
  providers: [MondayService],
  exports: [MondayService],
})
export class MondayModule {
  static forRoot(options: OAuth2ModuleConfig): DynamicModule {
    return {
      module: MondayModule,
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

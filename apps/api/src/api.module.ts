import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { CoreModule } from '#lib/core/core.module.js';
import { SentryModule } from '@sentry/nestjs/setup';
import { UIModule } from './ui/ui.module.js';
import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';

@Module({
  imports: [SentryModule.forRoot(), UIModule.register(), CoreModule],
  controllers: [],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class ApiModule {}

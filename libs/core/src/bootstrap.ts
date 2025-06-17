import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { NestExpressApplication } from '@nestjs/platform-express';
import { RedisModule } from '#lib/core/redis/redis.module.js';
import { EnvService } from '#lib/core/env/env.service.js';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { initSentry } from '#lib/core/sentry.js';

import {
  INestApplicationContext,
  ModuleMetadata,
  Module,
  Global,
} from '@nestjs/common';
import { PrismaService } from '#lib/core/prisma.service.js';

export enum AppType {
  Worker = 'Worker',
  API = 'API',
}

export async function bootstrap(
  metadata: ModuleMetadata & {
    appType: AppType;
  },
): Promise<NestExpressApplication | INestApplicationContext> {
  const { appType } = metadata;

  initSentry(appType);
  // @ts-expect-error appType is not a valid property of ModuleMetadata
  delete metadata.appType;

  // We're creating two modules to avoid everything being global.

  @Module(metadata)
  class CoreModule {}

  @Global()
  @Module({
    imports: [SentryModule.forRoot(), CoreModule, RedisModule],
    providers: [
      EnvService,
      PrismaService,
      {
        provide: APP_FILTER,
        useClass: SentryGlobalFilter,
      },
    ],
    exports: [EnvService],
  })
  class WrapperModule {}

  const app =
    appType === AppType.Worker
      ? await NestFactory.createApplicationContext(WrapperModule)
      : await NestFactory.create<NestExpressApplication>(WrapperModule, {
          forceCloseConnections: true,
        });

  const envService = app.get(EnvService);

  if (appType === AppType.API) {
    await (app as NestExpressApplication).listen(
      envService.getNumber('API_PORT', 3001),
    );
  }

  return app;
}

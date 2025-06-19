import { APP_FILTER, HttpAdapterHost, NestFactory } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { NestExpressApplication } from '@nestjs/platform-express';
import { RedisModule } from '#lib/core/redis/redis.module.js';
import { PrismaService } from '#lib/core/prisma.service.js';
import { EnvService } from '#lib/core/env/env.service.js';
import { initSentry } from '#lib/core/sentry.js';
import cookieParser from 'cookie-parser';

import {
  INestApplicationContext,
  ModuleMetadata,
  Provider,
  Module,
  Global,
  ValidationPipe,
} from '@nestjs/common';

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
      (appType === AppType.API
        ? {
            provide: APP_FILTER,
            inject: [HttpAdapterHost],
            useFactory(httpAdapterHost: HttpAdapterHost) {
              return new SentryGlobalFilter(httpAdapterHost.httpAdapter);
            },
          }
        : undefined) as Provider,
    ].filter(Boolean),
    exports: [EnvService, RedisModule, PrismaService],
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
    const helmet = (await import('helmet')).default;
    const _app = app as NestExpressApplication;

    _app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            imgSrc: [`'self'`, 'data:', 'blob:'],
            scriptSrc: [`'self'`, `https: 'unsafe-inline'`],
            manifestSrc: [`'self'`],
            frameSrc: [`'self'`],
            connectSrc: [`'self'`, 'https:', 'wss:'],
            workerSrc: [`'self'`, 'blob:'],
          },
        },
      }),
    );
    _app.enableCors();

    _app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        stopAtFirstError: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    _app.use(cookieParser());

    await _app.listen(envService.getNumber('API_PORT', 3001));
  }

  return app;
}

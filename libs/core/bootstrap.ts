import { APP_FILTER, HttpAdapterHost, NestFactory } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { NestExpressApplication } from '@nestjs/platform-express';
import { RedisModule } from './redis/redis.module.js';
import { PrismaService } from './prisma.service.js';
import { EnvService } from './env/env.service.js';
import { initSentry } from './sentry.js';

import {
  INestApplicationContext,
  ValidationPipe,
  ModuleMetadata,
  Provider,
  Module,
  Global,
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
    const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');
    const { RedisIoAdapter } = await import('./redis-io.adapter.js');
    const { default: cookieParser } = await import('cookie-parser');
    const helmet = (await import('helmet')).default;
    const _app = app as NestExpressApplication;

    // Security middlewares
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

    // Validation and parsing
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

    // OpenAPI/Swagger setup
    const config = new DocumentBuilder()
      .setTitle('API Documentation')
      .setVersion('latest')
      .addCookieAuth('access_token', {
        type: 'apiKey',
      })
      .addGlobalParameters({
        in: 'header',
        name: 'X-CSRF-Token',
        required: true,
      })
      .build();

    SwaggerModule.setup(
      'api',
      _app,
      SwaggerModule.createDocument(_app, config, {
        operationIdFactory(_, methodKey: string) {
          return methodKey;
        },
      }),
      {
        raw: false,
        swaggerOptions: {
          persistAuthorization: true,
        },
      },
    );

    // Socket.IO setup
    const redisIoAdapter = new RedisIoAdapter(_app);
    await redisIoAdapter.connectToRedis();

    // Start the server
    await _app.listen(envService.getNumber('API_PORT', 3001));
  }

  return app;
}

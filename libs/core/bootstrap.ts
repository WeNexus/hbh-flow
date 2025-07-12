import { GlobalEventService, PrismaService, RUNTIME_ID } from './misc';
import { APP_FILTER, HttpAdapterHost, NestFactory } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { NestExpressApplication } from '@nestjs/platform-express';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EnvService } from './env/env.service';
import { initSentry } from './misc/sentry';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from './misc';
import { RedisModule } from './redis';
import { APP_TYPE } from './misc';
import { AppType } from './types';

import {
  INestApplicationContext,
  ValidationPipe,
  ModuleMetadata,
  Provider,
  Module,
  Global,
} from '@nestjs/common';

export async function bootstrap(
  metadata: ModuleMetadata & {
    appType: AppType;
  },
): Promise<NestExpressApplication | INestApplicationContext> {
  const { appType } = metadata;

  initSentry(appType);
  // @ts-expect-error appType is not a valid property of ModuleMetadata
  delete metadata.appType;

  // Generate a unique runtime ID for the application.
  const runtimeId = `${appType}-${process.pid}-${crypto.randomUUID()}`;

  // We're creating two modules to avoid everything being global.

  @Module(metadata)
  class CoreModule {}

  @Global()
  @Module({
    imports: [
      EventEmitterModule.forRoot({
        wildcard: true,
        delimiter: '.',
        verboseMemoryLeak: false,
        ignoreErrors: false,
      }),
      SentryModule.forRoot(),
      CoreModule,
      RedisModule,
      JwtModule.registerAsync({
        inject: [EnvService],
        useFactory(env: EnvService) {
          return {
            secret: env.getString('APP_KEY'),
          };
        },
      }),
    ],
    providers: [
      {
        provide: APP_TYPE,
        useValue: appType,
      },
      {
        provide: RUNTIME_ID,
        useValue: runtimeId,
      },
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
      GlobalEventService,
    ].filter(Boolean),
    exports: [
      EnvService,
      RedisModule,
      PrismaService,
      JwtModule,
      APP_TYPE,
      GlobalEventService,
    ],
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
    const { RedisIoAdapter } = await import('./misc/redis-io.adapter.js');
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

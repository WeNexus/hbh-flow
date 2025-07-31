import { APP_FILTER, HttpAdapterHost, NestFactory } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { NestExpressApplication } from '@nestjs/platform-express';
import { RedisConfigService, RedisModule } from '#lib/core/redis';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaExtensionRedis } from '#lib/prisma-cache';
import { EnvService } from '#lib/core/env/env.service';
import { RUNTIME_ID, APP_TYPE } from '#lib/core/misc';
import { ZohoModule } from '#lib/zoho/zoho.module';
import { initSentry } from '#lib/core/misc/sentry';
import { HubModule } from '../hub/hub.module';
import { PrismaClient } from '@prisma/client';
import { AppType } from '#lib/core/types';
import { JwtModule } from '@nestjs/jwt';

import {
  GlobalEventService,
  ActivityService,
  PrismaService,
} from '#lib/core/services';

import {
  INestApplicationContext,
  ValidationPipe,
  ModuleMetadata,
  Provider,
  Module,
  Global,
} from '@nestjs/common';

/**
 * Bootstraps the NestJS application with the provided metadata.
 * This function initializes the application with necessary modules,
 * configures security, validation, and sets up the environment.
 * It also handles different application types (API or Worker).
 *
 * @param metadata - The metadata for the module, including the application type.
 * @returns A promise that resolves to the NestJS application instance.
 */
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
      HubModule,
      JwtModule.registerAsync({
        inject: [EnvService],
        useFactory(env: EnvService) {
          return {
            secret: env.getString('APP_KEY'),
          };
        },
      }),
      ZohoModule.forRoot({
        useFactory(env: EnvService) {
          return {
            clientId: env.getString('ZOHO_CLIENT_ID'),
            clientSecret: env.getString('ZOHO_CLIENT_SECRET'),
            connections: [
              {
                id: 'hbh',
                description: 'Honehbeeherb Zoho Connection',
                authorizationURL: 'https://accounts.zoho.com/oauth/v2/auth',
                tokenURL: 'https://accounts.zoho.com/oauth/v2/token',
              },
            ],
          };
        },
        inject: [EnvService],
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
      {
        provide: PrismaService,
        inject: [EnvService, RedisConfigService],
        useFactory(envService: EnvService, redisConfig: RedisConfigService) {
          return new PrismaClient().$extends(
            PrismaExtensionRedis({
              client: {
                ...redisConfig.get(),
                db: envService.getNumber('PRISMA_REDIS_DB', 2),
              },
              config: {
                auto: false,
                type: 'JSON',
                ttl: 60 * 60 * 6, // 6 hours
                stale: 60 * 60, // 1 hour
              },
            }),
          );
        },
      },
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
      ActivityService,
    ].filter(Boolean),
    exports: [
      EnvService,
      EventEmitterModule,
      RedisModule,
      PrismaService,
      JwtModule,
      APP_TYPE,
      HubModule,
      ZohoModule,
      GlobalEventService,
      ActivityService,
    ],
  })
  class WrapperModule {}

  const app =
    appType === AppType.Worker
      ? await NestFactory.createApplicationContext(WrapperModule)
      : await NestFactory.create<NestExpressApplication>(WrapperModule, {
          forceCloseConnections: true,
          rawBody: true,
        });

  const envService = app.get(EnvService);

  if (appType === AppType.API) {
    const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');
    const { RedisIoAdapter } = await import('./misc/redis-io.adapter.js');
    const { default: cookieParser } = await import('cookie-parser');
    const helmet = (await import('helmet')).default;
    const _app = app as NestExpressApplication;

    _app.set('trust proxy', true); // Trust the first proxy (for reverse proxies)

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

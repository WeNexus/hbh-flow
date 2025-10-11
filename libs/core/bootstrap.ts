import { WoocommerceModule } from '#lib/woocommerce/woocommerce.module';
import { APP_FILTER, HttpAdapterHost, NestFactory } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { BigCommerceModule } from '#lib/bigcommerce/bigcommerce.module';
import { APP_TYPE, RedisIoAdapter, RUNTIME_ID } from '#lib/core/misc';
import { PrismaExtensionRedis } from '#lib/core/misc/prisma-cache';
import { FujimausaModule } from '#lib/fujimausa/fujimausa.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { FlodeskModule } from '#lib/flodesk/flodesk.module';
import { ShopifyModule } from '#lib/shopify/shopify.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MondayModule } from '#lib/monday/monday.module';
import { REDIS_SUB, RedisModule } from '#lib/core/redis';
import { EnvService } from '#lib/core/env/env.service';
import { ZohoModule } from '#lib/zoho/zoho.module';
import { initSentry } from '#lib/core/misc/sentry';
import { HubModule } from '../hub/hub.module';
import { PrismaClient } from '@prisma/client';
import { AppType } from '#lib/core/types';
import { JwtModule } from '@nestjs/jwt';
import { Redis } from 'ioredis';

import {
  ActivityService,
  GlobalEventService,
  IPInfoService,
  MongoService,
  PostgresService,
  PrismaService,
} from '#lib/core/services';

import {
  Global,
  INestApplicationContext,
  Module,
  ModuleMetadata,
  Provider,
  ValidationPipe,
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

  // @ts-expect-error toJSON is not a standard method on BigInt
  BigInt.prototype.toJSON = function () {
    return (this as bigint).toString();
  };

  initSentry(appType);
  // @ts-expect-error appType is not a valid property of ModuleMetadata
  delete metadata.appType;

  // Generate a unique runtime ID for the application.
  const runtimeId = `${appType}:${process.pid}:${crypto.randomUUID()}`;

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
          };
        },
        inject: [EnvService],
      }),
      FujimausaModule,
      BigCommerceModule,
      FlodeskModule,
      WoocommerceModule,
      ShopifyModule,
      MondayModule,
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
        inject: [EnvService, REDIS_SUB],
        async useFactory(envService: EnvService, redis: Redis) {
          const redisClone = redis.duplicate({
            db: envService.getNumber('PRISMA_REDIS_DB', 2),
            maxRetriesPerRequest: null,
          });

          await redisClone.connect();

          return new PrismaClient().$extends(
            PrismaExtensionRedis({
              redis: redisClone,
              config: {
                auto: false,
                type: 'JSON',
                ttl: 60 * 60 * 6, // 6 hours
                stale: 0,
              },
            }),
          );
        },
      },
      {
        provide: MongoService,
        inject: [EnvService],
        useFactory(env: EnvService) {
          return new MongoService(env.getString('MONGO_URL'));
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
      PostgresService,
      {
        provide: IPInfoService,
        inject: [EnvService],
        useFactory(env: EnvService) {
          return new IPInfoService(env.getString('IPINFO_API_KEY'));
        },
      },
    ].filter(Boolean),
    exports: [
      APP_TYPE,
      RUNTIME_ID,
      EnvService,
      EventEmitterModule,
      RedisModule,
      PrismaService,
      MongoService,
      PostgresService,
      JwtModule,
      HubModule,
      ZohoModule,
      GlobalEventService,
      ActivityService,
      IPInfoService,
      BigCommerceModule,
      FujimausaModule,
      FlodeskModule,
      WoocommerceModule,
      ShopifyModule,
      MondayModule,
    ],
  })
  class WrapperModule {}

  const app = await NestFactory.create<NestExpressApplication>(WrapperModule, {
    forceCloseConnections: true,
    rawBody: appType === AppType.API,
  });

  const envService = app.get(EnvService);

  if (appType === AppType.API) {
    const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');
    const { default: cookieParser } = await import('cookie-parser');
    const helmet = (await import('helmet')).default;

    app.set('trust proxy', true); // Trust the first proxy (for reverse proxies)

    // Security middlewares
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            imgSrc: [
              process.env.NODE_ENV === 'development' ? 'http:' : '',
              `https:`,
              'data:',
              'blob:',
            ],
            scriptSrc: [`'self'`, `https: 'unsafe-inline'`],
            manifestSrc: [`'self'`],
            frameSrc: [`'self'`],
            connectSrc: [`'self'`, 'https:', 'wss:'],
            workerSrc: [`'self'`, 'blob:'],
          },
        },
      }),
    );

    app.enableCors();

    // Validation and parsing
    app.useGlobalPipes(
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

    app.use(cookieParser());

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
      app,
      SwaggerModule.createDocument(app, config, {
        operationIdFactory(_, methodKey: string) {
          return methodKey;
        },
      }),
      {
        raw: true,
        ui: true,
        yamlDocumentUrl: '/api/docs.yaml',
        jsonDocumentUrl: '/api/docs.json',
        swaggerOptions: {
          persistAuthorization: true,
        },
      },
    );
  }

  // Socket.IO setup
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // Start the server
  const port =
    appType === AppType.API
      ? envService.getNumber('API_PORT', 3001)
      : envService.getNumber('WORKER_PORT', 3002);
  await app.listen(port);

  return app;
}

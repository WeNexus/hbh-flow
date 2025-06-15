import { UIMiddleware } from './ui.middleware.js';
import process from 'node:process';

import {
  MiddlewareConsumer,
  DynamicModule,
  NestModule,
  Module,
} from '@nestjs/common';

@Module({})
export class UIModule implements NestModule {
  static register(): DynamicModule {
    if (process.env.NODE_ENV !== 'production') {
      return {
        module: UIModule,
      };
    }

    return {
      module: UIModule,
      providers: [UIMiddleware],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(UIMiddleware).exclude('api/*path').forRoutes('/');
  }
}

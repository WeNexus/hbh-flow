import { MiddlewareConsumer, NestModule, Module } from '@nestjs/common';
import { UIMiddleware } from './ui.middleware.js';

@Module({
  providers: [UIMiddleware],
})
export class UIModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(UIMiddleware)
      .exclude('/api', '/api/*path', '/socket.io')
      .forRoutes('/');
  }
}

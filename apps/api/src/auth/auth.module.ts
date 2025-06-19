import { EnvService } from '#lib/core/env/env.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [EnvService],
      useFactory(env: EnvService) {
        return {
          secret: env.getString('APP_KEY'),
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthGuard, AuthService],
  exports: [AuthGuard, AuthService],
})
export class AuthModule {}

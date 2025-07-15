import { TokenRefreshWorkflow } from '#lib/oauth2/misc';
import { OAuth2Service } from './oauth2.service';
import { DiscoveryModule } from '@nestjs/core';
import { Module } from '@nestjs/common';

@Module({
  imports: [DiscoveryModule],
  providers: [OAuth2Service, TokenRefreshWorkflow],
  exports: [OAuth2Service],
})
export class OAuth2Module {}

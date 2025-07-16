import { HubService } from './hub.service';
import { DiscoveryModule } from '@nestjs/core';
import { TokenRefreshWorkflow } from './misc';
import { Module } from '@nestjs/common';

@Module({
  imports: [DiscoveryModule],
  providers: [HubService, TokenRefreshWorkflow],
  exports: [HubService],
})
export class HubModule {}

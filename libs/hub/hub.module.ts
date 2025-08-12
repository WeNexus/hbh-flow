import { ConnectionTestWorkflow, TokenRefreshWorkflow } from './misc';
import { DiscoveryModule } from '@nestjs/core';
import { HubService } from './hub.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [DiscoveryModule],
  providers: [HubService, TokenRefreshWorkflow, ConnectionTestWorkflow],
  exports: [HubService],
})
export class HubModule {}

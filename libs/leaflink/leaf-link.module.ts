import { LeafLinkService } from './leaf-link.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [LeafLinkService],
  exports: [LeafLinkService],
})
export class LeafLinkModule {}

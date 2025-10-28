import { OdooService } from './odoo.service';
import { Module } from '@nestjs/common';

@Module({
  providers: [OdooService],
  exports: [OdooService],
})
export class OdooModule {}

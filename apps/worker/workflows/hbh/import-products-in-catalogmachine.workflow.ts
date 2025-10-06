import { BigCommerceService } from '#lib/bigcommerce/bigcommerce.service';
import { Step, Workflow } from '#lib/workflow/decorators';
import { ZohoService } from '#lib/zoho/zoho.service';
import { cron, WorkflowBase } from '#lib/workflow/misc';
import { EnvService } from '#lib/core/env';
import mongodb, { WithId } from 'mongodb';
import { Logger } from '@nestjs/common';
import { chunk } from 'lodash-es';

const MongoClient = mongodb.MongoClient;

@Workflow({
  name: 'HBH - Import Products from BigCommerce to CatalogMachine',
  webhook: true,
  concurrency: 1,
  triggers: [
    cron('0 */6 * * *', {
      // Every 6 hours
      timezone: 'America/New_York',
    }),
  ],
})
export class ImportProductsInCatalogMachineWorkflow extends WorkflowBase {
  constructor(
    private readonly bigCommerceService: BigCommerceService,
    private readonly zohoService: ZohoService,
    private readonly envService: EnvService,
  ) {
    super();
  }
}

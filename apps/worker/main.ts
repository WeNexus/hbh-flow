import { WorkflowModule } from '#lib/workflow/workflow.module.js';
import { AppType } from '#lib/core/types/app-type.js';
import { bootstrap } from '#lib/core/bootstrap.js';
import { gateways } from '../api/gateways';
import { workflows } from './workflows';

await bootstrap({
  appType: AppType.Worker,
  providers: [...workflows, ...gateways],
  exports: [...gateways],
  imports: [WorkflowModule],
});

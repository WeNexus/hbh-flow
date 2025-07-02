import { WorkflowModule } from '#lib/workflow/workflow.module.js';
import { AppType } from '#lib/core/types/app-type.js';
import { bootstrap } from '#lib/core/bootstrap.js';
import { workflows } from './workflows/index.js';

await bootstrap({
  appType: AppType.Worker,
  imports: [WorkflowModule.register(workflows)],
});

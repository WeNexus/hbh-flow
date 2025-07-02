import { WorkflowModule } from '#lib/workflow/workflow.module.js';
import { workflows } from '#app/worker/workflows/index.js';
import { AppType } from '#lib/core/types/app-type.js';
import { bootstrap } from '#lib/core/bootstrap.js';
import { AuthModule } from './auth/auth.module.js';
import { UIModule } from './ui/ui.module.js';

await bootstrap({
  appType: AppType.API,
  imports: [AuthModule, UIModule, WorkflowModule.register(workflows)],
});

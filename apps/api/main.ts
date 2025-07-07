import { WorkflowController } from './controllers/workflow.controller';
import { WebhookController } from './controllers/webhook.controller';
import { WorkflowModule } from '#lib/workflow/workflow.module.js';
import { AuthController } from './controllers/auth.controller';
import { AuthModule } from '#lib/auth/auth.module';
import { workflows } from '../worker/workflows';
import { UIModule } from './ui/ui.module.js';
import { bootstrap } from '#lib/core';
import { AppType } from '#lib/core';

await bootstrap({
  appType: AppType.API,
  imports: [AuthModule, UIModule, WorkflowModule.register(workflows)],
  controllers: [AuthController, WebhookController, WorkflowController],
});

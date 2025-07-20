import { WorkflowController } from './controllers/workflow.controller';
import { WebhookController } from './controllers/webhook.controller';
import { OAuth2Controller } from './controllers/oauth2.controller';
import { WorkflowModule } from '#lib/workflow/workflow.module.js';
import { AuthController } from './controllers/auth.controller';
import { AuthModule } from '#lib/auth/auth.module';
import { workflows } from '../worker/workflows';
import { bootstrap } from '#lib/core/bootstrap';
import { UIModule } from './ui/ui.module.js';
import { AppType } from '#lib/core/types';

await bootstrap({
  appType: AppType.API,
  imports: [AuthModule, UIModule, WorkflowModule],
  providers: [...workflows],
  controllers: [
    AuthController,
    WebhookController,
    WorkflowController,
    OAuth2Controller,
  ],
});

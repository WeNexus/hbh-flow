import { ConnectionController } from './controllers/connection.controller';
import { ProviderController } from './controllers/provider.controller';
import { ScheduleController } from './controllers/schedule.controller';
import { WorkflowController } from './controllers/workflow.controller';
import { WebhookController } from './controllers/webhook.controller';
import { FolderController } from './controllers/folder.controller';
import { WorkflowModule } from '#lib/workflow/workflow.module.js';
import { EventController } from './controllers/event.controller';
import { UserController } from './controllers/user.controller';
import { AuthController } from './controllers/auth.controller';
import { JobController } from './controllers/job.controller';
import { HubController } from './controllers/hub.controller';
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
    UserController,
    HubController,
    ProviderController,
    ConnectionController,
    FolderController,
    WorkflowController,
    JobController,
    WebhookController,
    EventController,
    ScheduleController,
  ],
});

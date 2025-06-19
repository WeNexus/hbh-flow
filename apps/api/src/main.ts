import { AppType, bootstrap } from '#lib/core/bootstrap.js';
import { AuthModule } from './auth/auth.module.js';
import { UIModule } from './ui/ui.module.js';

await bootstrap({
  appType: AppType.API,
  imports: [AuthModule, UIModule],
});

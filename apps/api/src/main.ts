import { AppType, bootstrap } from '#lib/core/bootstrap.js';
import { UIModule } from './ui/ui.module.js';

await bootstrap({
  appType: AppType.API,
  imports: [UIModule],
});

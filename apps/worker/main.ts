import { AppType, bootstrap } from '#lib/core/bootstrap.js';

await bootstrap({
  appType: AppType.Worker,
});

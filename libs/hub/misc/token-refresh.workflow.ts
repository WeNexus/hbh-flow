import { Step, Workflow } from '#lib/workflow/decorators';
import { WorkflowBase } from '#lib/workflow/misc';
import { HubService } from '../hub.service';
import { ModuleRef } from '@nestjs/core';

interface Payload {
  provider: string;
  connection: string;
}

/**
 * Workflow to refresh OAuth2 tokens.
 * This workflow is internal and should not be exposed to the public API.
 * It is used by the OAuth2 service to handle token refresh operations.
 *
 * @internal
 */
@Workflow({ internal: true })
export class TokenRefreshWorkflow extends WorkflowBase<Payload> {
  constructor(
    private readonly hubService: HubService,
    moduleRef: ModuleRef,
  ) {
    super(moduleRef);
  }

  @Step(0)
  async refreshToken() {
    return this.hubService.refreshTokens(
      this.payload.provider,
      this.payload.connection,
    );
  }
}

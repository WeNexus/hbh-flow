import { Workflow } from '#lib/workflow/decorators/workflow.decorator.js';
import { cron, event, webhook } from '#lib/workflow/misc/trigger.js';
import { WorkflowBase } from '#lib/workflow/misc/workflow-base.js';
import { Step } from '#lib/workflow/decorators';
import { ModuleRef } from '@nestjs/core';

@Workflow({
  triggers: [
    event('Order.Created', 'HBH'),
    webhook(),
  ],
  concurrency: 1,
})
export class TestWorkflow extends WorkflowBase {
  constructor(moduleRef: ModuleRef) {
    super(moduleRef);
  }

  @Step(1)
  step1() {
    console.log('Step 1 executed');
    // This is the first step of the workflow
  }

  @Step(2)
  step2() {
    // This is the second step of the workflow
  }
}

import { Workflow } from '#lib/workflow/decorators/workflow.decorator.js';
import { WorkflowBase } from '#lib/workflow/misc/workflow-base.js';
import { cron, event } from '#lib/workflow/misc/trigger.js';
import { Step } from '#lib/workflow/decorators';
import { ModuleRef } from '@nestjs/core';

@Workflow({
  triggers: [
    event('Order.Created', 'HBH'),
    // every 5 seconds
    cron('*/5 * * * * *', { oldPattern: '0 0 * * *' }),
  ],
  webhook: true,
  concurrency: 1,
  maxRetries: 3,
})
export class TestWorkflow extends WorkflowBase {
  constructor(moduleRef: ModuleRef) {
    super(moduleRef);
  }

  @Step(1)
  step1() {
    // This is the first step of the workflow
    console.log('Step 1 executed');
  }

  @Step(2)
  step2() {
    // This is the second step of the workflow
    console.log('Step 2 executed');
    return this.pause();
  }

  @Step(3)
  step3() {
    // This is the second step of the workflow
    console.log('Step 3 executed');
  }

  @Step(4)
  step4() {
    // This is the second step of the workflow
    console.log('Step 4 executed');
  }
}

import { WorkflowBase } from '../misc/workflow-base.js';
import { JobPayload } from './job-payload.js';
import { Queue } from 'bullmq';

interface StepInfo {
  method: string;
  index: number;
}

export interface WorkflowInfo {
  class: WorkflowBase;
  steps: StepInfo[];
  queue: Queue<JobPayload>;
  worker: Queue<JobPayload>;
}

export interface JobPayload {
  requesterRuntimeId?: string;
  needResponse?: boolean;
  dbJobId?: number;
  scheduleId?: number;
  stepIndex?: number;
  lastStepIndex?: number;
  context?: any;
  isRetry?: boolean;
  steps?: string[];
}

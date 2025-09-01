export interface JobPayload {
  requesterRuntimeId?: string;
  needResponse?: boolean;
  dbJobId?: number;
  scheduleId?: number;
  stepIndex?: number;
  context?: any;
  isRetry?: boolean;
}

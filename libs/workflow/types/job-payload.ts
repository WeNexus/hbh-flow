export interface JobPayload {
  dbJobId?: number;
  scheduleId?: number;
  stepIndex?: number;
  context?: any;
  isRetry?: boolean;
}

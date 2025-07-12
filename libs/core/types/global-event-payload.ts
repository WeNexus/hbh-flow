export interface GlobalEventPayload {
  runtimeId: string;
  event: string;
  data: object;
  broadcast?: boolean;
  sentryTrace?: string;
  sentryBaggage?: string;
}

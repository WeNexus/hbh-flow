export interface GlobalEventPayload<D = object> {
  runtimeId: string;
  event: string;
  data: D;
  broadcast?: boolean;
  sentryTrace?: string;
  sentryBaggage?: string;
}

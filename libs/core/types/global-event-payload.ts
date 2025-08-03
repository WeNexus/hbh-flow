import { Jsonify } from 'type-fest';

export interface GlobalEventPayload<D = object> {
  runtimeId: string;
  event: string;
  data: Jsonify<D>;
  broadcast?: boolean;
  sentryTrace?: string;
  sentryBaggage?: string;
}

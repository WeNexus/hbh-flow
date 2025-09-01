import { Jsonify } from 'type-fest';

export interface GlobalEventPayload<D = object> {
  sender: string;
  receiver?: string;
  event: string;
  data: Jsonify<D>;
  ignoreSelf?: boolean;
  sentryTrace?: string;
  sentryBaggage?: string;
}

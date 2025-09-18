export interface EmitOptions {
  ignoreSelf?: boolean;
  receiver?: string;
  sentry?: {
    trace?: string;
    baggage?: string;
  };
}

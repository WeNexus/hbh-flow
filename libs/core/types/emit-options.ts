export interface EmitOptions {
  broadcast?: boolean;
  sentry?: {
    trace?: string;
    baggage?: string;
  };
}

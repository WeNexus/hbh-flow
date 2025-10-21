export interface NotifySubscribersOptions {
  connection: string;
  topic: string;
  payload: Record<string, any>;
}

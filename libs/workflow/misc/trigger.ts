import { TriggerType, TriggerMeta } from '../types/trigger-meta.js';

export function event(event: string, source: string): TriggerMeta {
  return {
    type: TriggerType.Event,
    eventSource: source,
    event,
  };
}

export function cron(
  pattern: string,
  meta?: Pick<TriggerMeta, 'oldPattern' | 'oldName' | 'timezone' | 'immediate'>,
): TriggerMeta {
  return {
    type: TriggerType.Cron,
    pattern,
    ...meta,
  };
}

export function webhook(): TriggerMeta {
  return {
    type: TriggerType.Webhook,
  };
}

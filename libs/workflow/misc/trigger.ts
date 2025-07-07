import { TriggerMetaSchema } from '#lib/workflow/schema';
import { TriggerType } from './trigger-type.enum.js';

export function event(event: string, source: string): TriggerMetaSchema {
  return {
    type: TriggerType.Event,
    eventSource: source,
    event,
  };
}

export function cron(
  pattern: string,
  meta?: Pick<
    TriggerMetaSchema,
    'oldPattern' | 'oldName' | 'timezone' | 'immediate'
  >,
): TriggerMetaSchema {
  return {
    type: TriggerType.Cron,
    pattern,
    ...meta,
  };
}

export function webhook(): TriggerMetaSchema {
  return {
    type: TriggerType.Webhook,
  };
}

import { TriggerMetaSchema } from '#lib/workflow/schema';
import { TriggerType } from './trigger-type.enum.js';

/**
 * Helper function to create a metadata object for event triggers.
 *
 * @param event - The name of the event to trigger on.
 * @param source - The source of the event (e.g., 'user', 'system').
 * @returns An object containing the trigger type, event source, and event name.
 */
export function event(event: string, source: string): TriggerMetaSchema {
  return {
    type: TriggerType.Event,
    eventSource: source,
    event,
  };
}

/**
 * Helper function to create a metadata object for cron triggers.
 *
 * @param pattern - The cron pattern to use for scheduling the trigger.
 * @param meta - Optional metadata including old pattern, old name, timezone, and immediate execution flag.
 * @returns An object containing the trigger type and cron pattern.
 */
export function cron(
  pattern: string,
  meta?: Pick<TriggerMetaSchema, 'oldPattern' | 'timezone' | 'immediate'>,
): TriggerMetaSchema {
  return {
    type: TriggerType.Cron,
    pattern,
    ...meta,
  };
}

/**
 * Helper function to create a metadata object for webhook triggers.
 *
 * @returns An object containing the trigger type for webhooks.
 */
export function webhook(): TriggerMetaSchema {
  return {
    type: TriggerType.Webhook,
  };
}

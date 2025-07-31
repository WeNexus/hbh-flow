import { TriggerMetaSchema } from '#lib/workflow/schema';
import { TriggerType } from './trigger-type.enum.js';

/**
 * Helper function to create a metadata object for event triggers.
 *
 * @param event - The name of the event to trigger on.
 * @param provider - Optional provider name for the event trigger.
 * @param connection - Optional connection name to use for the event trigger.
 * @returns An object containing the trigger type, event source, and event name.
 */
export function event(
  event: string,
  provider?: string,
  connection?: string,
): TriggerMetaSchema {
  return {
    type: TriggerType.Event,
    provider,
    connection,
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

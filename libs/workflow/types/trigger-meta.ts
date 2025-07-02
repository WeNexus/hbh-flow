import { Timezone } from './timezone.js';

export enum TriggerType {
  Webhook = 'Webhook',
  Cron = 'Cron',
  Event = 'Event',
}

export interface TriggerMeta {
  type: TriggerType;
  event?: string | string[];
  eventSource?: string; // There could multiple instance of the same service, so we need to specify the source. e.g., Zoho CRM (HBH) or Zoho CRM (Client).
  pattern?: string; // Cron expression for scheduling
  oldPattern?: string; // Old cron expression for scheduling, used for updating existing schedules
  oldName?: string; // Old name of the workflow, used for updating existing schedules
  immediate?: boolean; // If true, the job will be executed immediately after it is created.
  timezone?: Timezone; // Timezone for the cron job
}

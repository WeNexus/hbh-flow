import { Activity, Revision } from '@prisma/client';

export interface ActivityEventPayload {
  activity: Activity;
  revision: Revision | null;
}

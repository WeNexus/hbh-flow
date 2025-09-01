import { Job as DBJob } from '@prisma/client';

export type DBJobSlim = Omit<
  DBJob,
  'payload' | 'sentryBaggage' | 'sentryTrace' | 'responseMeta'
>;

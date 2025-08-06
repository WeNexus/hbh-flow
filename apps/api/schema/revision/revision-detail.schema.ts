import { ActivitySchema } from '../activity/activity.schema';
import { RevisionSchema } from './revision.schema';
import { ApiProperty } from '@nestjs/swagger';

export class RevisionDetailSchema extends RevisionSchema {
  @ApiProperty({
    description:
      'Revision details associated with the activity, if applicable.',
    required: false,
  })
  Activity: ActivitySchema;
}

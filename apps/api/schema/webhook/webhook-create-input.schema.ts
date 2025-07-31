import { HashAlgorithm, WebhookHashLocation } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

import {
  IsPositive,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDate,
} from 'class-validator';

export class WebhookCreateInputSchema {
  @ApiProperty({
    description: 'The id of the workflow for which to generate a token',
  })
  @IsPositive()
  workflowId: number;

  @ApiProperty({
    description:
      'The name of the token to be generated, used for identification',
    required: true,
  })
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'A description of the token, used for explanation',
  })
  @IsOptional()
  description?: string | null;

  @ApiProperty({
    description: 'The secret key used to do HMAC verification',
    required: false,
  })
  @IsOptional()
  secret?: string | null;

  @ApiProperty({
    description: 'The location of the hash in the webhook payload',
    enum: WebhookHashLocation,
  })
  @IsOptional()
  @IsEnum(WebhookHashLocation)
  hashLocation?: WebhookHashLocation | null;

  @ApiProperty({
    description: 'The key used to extract the hash from the webhook payload',
    example: 'x-shopify-hmac-sha256',
  })
  @IsOptional()
  hashKey?: string | null;

  @ApiProperty({
    description: 'The algorithm used for hashing the webhook payload',
    enum: HashAlgorithm,
  })
  @IsOptional()
  @IsEnum(HashAlgorithm)
  hashAlgorithm?: HashAlgorithm | null;

  @ApiProperty({
    description: 'The expiration date for the token in ISO 8601 format',
    format: 'date-time',
    example: '2023-10-01T00:00:00Z',
  })
  @Type(() => Date)
  @IsDate()
  expiresAt: Date;
}

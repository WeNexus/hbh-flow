import { HashAlgorithm, WebhookHashLocation } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

import {
  IsPositive,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDate,
  IsBoolean,
} from 'class-validator';

export class WebhookCreateInputSchema {
  @ApiProperty({
    description:
      'The ID of the workflow for which the webhook token is being created.',
    example: 42,
  })
  @IsPositive()
  workflowId: number;

  @ApiProperty({
    description: 'A descriptive name for the webhook token.',
    required: true,
    example: 'Shopify Order Created Webhook',
  })
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description:
      'An optional description of the webhook token and its purpose.',
    required: false,
    example: 'Used to validate order creation events from Shopify.',
  })
  @IsOptional()
  description?: string | null;

  @ApiProperty({
    description: 'An optional secret key used for HMAC verification.',
    required: false,
    example: 'my-secret-key',
  })
  @IsOptional()
  secret?: string | null;

  @ApiProperty({
    description:
      'Specifies where to locate the HMAC hash in the webhook payload.',
    enum: WebhookHashLocation,
    required: false,
    example: WebhookHashLocation.HEADER,
  })
  @IsOptional()
  @IsEnum(WebhookHashLocation)
  hashLocation?: WebhookHashLocation | null;

  @ApiProperty({
    description: 'The key name used to retrieve the hash from the payload.',
    required: false,
    example: 'x-shopify-hmac-sha256',
  })
  @IsOptional()
  hashKey?: string | null;

  @ApiProperty({
    description: 'The algorithm used to compute the HMAC hash.',
    enum: HashAlgorithm,
    required: false,
    example: HashAlgorithm.sha256,
  })
  @IsOptional()
  @IsEnum(HashAlgorithm)
  hashAlgorithm?: HashAlgorithm | null;

  @ApiProperty({
    description:
      'The ISO 8601 formatted expiration date and time for the webhook.',
    format: 'date-time',
    example: '2023-10-01T00:00:00Z',
  })
  @Type(() => Date)
  @IsDate()
  expiresAt: Date;

  @ApiProperty({
    description:
      'Specifies whether the webhook is currently active. Set to true to enable, or false to disable the webhook.',
    default: true,
    required: false,
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

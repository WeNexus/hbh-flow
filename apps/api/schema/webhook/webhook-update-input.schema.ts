import { HashAlgorithm, WebhookHashLocation } from '@prisma/client';
import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WebhookUpdateInputSchema {
  @ApiProperty({
    description: 'The updated name of the webhook, used for identification.',
    required: false,
    example: 'Shopify Order Updated Webhook',
  })
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'A new or updated description for the webhook.',
    required: false,
    example: 'Handles order update events from Shopify.',
  })
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Updated secret key used for HMAC verification.',
    required: false,
    example: 'new-secret-key-456',
  })
  @IsOptional()
  secret?: string;

  @ApiProperty({
    description:
      'Updated location where the hash is found in the webhook payload.',
    enum: WebhookHashLocation,
    required: false,
    example: WebhookHashLocation.HEADER,
  })
  @IsOptional()
  @IsEnum(WebhookHashLocation)
  hashLocation?: WebhookHashLocation;

  @ApiProperty({
    description:
      'Updated key used to extract the hash from the webhook payload.',
    required: false,
    example: 'x-shopify-hmac-sha256',
  })
  @IsOptional()
  hashKey?: string;

  @ApiProperty({
    description: 'Updated algorithm used for hashing the webhook payload.',
    enum: HashAlgorithm,
    required: false,
    example: HashAlgorithm.sha256,
  })
  @IsOptional()
  @IsEnum(HashAlgorithm)
  hashAlgorithm?: HashAlgorithm;

  @ApiProperty({
    description: 'Indicates whether the webhook is enabled or disabled.',
    required: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

import { HashAlgorithm, WebhookHashLocation } from '@prisma/client';
import { IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WebhookUpdateInputSchema {
  @ApiProperty({
    description:
      'The name of the token to be generated, used for identification',
    required: false,
  })
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'A description of the token, used for explanation',
  })
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'The secret key used to do HMAC verification',
    required: false,
  })
  @IsOptional()
  secret?: string;

  @ApiProperty({
    description: 'The location of the hash in the webhook payload',
    enum: WebhookHashLocation,
  })
  @IsOptional()
  @IsEnum(WebhookHashLocation)
  hashLocation?: WebhookHashLocation;

  @ApiProperty({
    description: 'The key used to extract the hash from the webhook payload',
    example: 'x-shopify-hmac-sha256',
  })
  @IsOptional()
  hashKey?: string;

  @ApiProperty({
    description: 'The algorithm used for hashing the webhook payload',
    enum: HashAlgorithm,
  })
  @IsOptional()
  @IsEnum(HashAlgorithm)
  hashAlgorithm?: HashAlgorithm;
}

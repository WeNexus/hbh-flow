import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { listData, PrismaWhereExceptionFilter } from '#lib/core/misc';
import { ActivityService, PrismaService } from '#lib/core/services';
import { WorkflowService } from '#lib/workflow/workflow.service';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';
import { Auth, Protected } from '#lib/auth/decorators';
import { ListInputSchema } from '#lib/core/schema';
import type { AuthContext } from '#lib/auth/types';
import { omit } from 'lodash-es';
import express from 'express';
import crypto from 'crypto';

import {
  WebhookCreateInputSchema,
  WebhookUpdateInputSchema,
  WebhookListOutputSchema,
  WebhookSchema,
} from '../schema';

import {
  UnauthorizedException,
  BadRequestException,
  type RawBodyRequest,
  NotFoundException,
  Controller,
  UseFilters,
  HttpCode,
  Delete,
  Query,
  Param,
  Patch,
  Body,
  Post,
  Req,
  Get,
} from '@nestjs/common';

@Controller('api/webhooks')
export class WebhookController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly activityService: ActivityService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('/')
  @Protected('OBSERVER')
  @UseFilters(PrismaWhereExceptionFilter)
  @ApiOperation({
    summary: 'List all webhooks',
    description: 'Retrieves a paginated list of all configured webhooks.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved the list of webhooks.',
    type: WebhookListOutputSchema,
  })
  async list(
    @Query() input: ListInputSchema,
    @Auth() auth: AuthContext,
  ): Promise<WebhookListOutputSchema> {
    return listData(
      this.prisma,
      'webhook',
      input,
      ['name', 'description', 'hashKey'],
      {
        omit: {
          secret: !auth.isPowerUser, // Hide secret from non-power users
        },
      },
    );
  }

  @Get('/:id')
  @Protected('OBSERVER')
  @ApiParam({
    name: 'id',
    description: 'The ID of the webhook to retrieve.',
    type: Number,
  })
  @ApiOperation({
    summary: 'Get a webhook by ID',
    description: 'Fetches details of a specific webhook using its ID.',
  })
  @ApiResponse({
    status: 404,
    description: 'Webhook not found.',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook retrieved successfully.',
    type: WebhookSchema,
  })
  async single(
    @Param('id') id: number,
    @Auth() auth: AuthContext,
  ): Promise<WebhookSchema> {
    try {
      const { result: webhook } = await this.prisma.webhook.findUniqueOrThrow({
        where: { id },
        omit: {
          secret: !auth.isPowerUser,
        },
        cache: {
          key: `webhook:${id}`,
        },
      });

      return webhook;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new NotFoundException('Webhook not found.');
    }
  }

  @Post('/')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Create a webhook and generate a JWT token',
    description:
      'Creates a new webhook and returns a JWT token for authenticating future webhook requests.',
  })
  @ApiResponse({
    status: 400,
    description: 'Workflow not found or webhook trigger not enabled.',
  })
  @ApiResponse({
    status: 201,
    description: 'Webhook created successfully.',
    type: WebhookSchema,
  })
  async create(
    @Req() req: express.Request,
    @Auth() auth: AuthContext,
    @Body() input: WebhookCreateInputSchema,
  ): Promise<WebhookSchema> {
    const flow = await this.workflowService.resolveClass(input.workflowId);

    if (!flow) {
      throw new BadRequestException('Workflow not found.');
    }

    const config = await this.workflowService.getConfig(flow);

    if (!config?.webhook) {
      throw new BadRequestException(
        'The specified workflow does not support webhook triggers.',
      );
    }

    const dbFlow = await this.workflowService.getDBFlow(flow);

    const { result: webhook } = await this.prisma.webhook.create({
      data: {
        workflowId: dbFlow.id,
        name: input.name,
        description: input.description,
        secret: input.secret,
        hashLocation: input.hashLocation,
        hashAlgorithm: input.hashAlgorithm,
        hashKey: input.hashKey,
        expiresAt: input.expiresAt,
        active: input.active ?? true, // Default to active if not specified,
      },
    });

    const token = await this.jwtService.signAsync(
      { wid: webhook.id },
      {
        subject: 'access',
        audience: 'workflow',
        issuer: 'webhook',
        expiresIn: Math.round(
          (new Date(input.expiresAt).getTime() - Date.now()) / 1000,
        ),
      },
    );

    const { result: updated } = await this.prisma.webhook.update({
      where: { id: webhook.id },
      data: { token },
    });

    await this.activityService.recordActivity({
      req,
      userId: auth.user.id,
      resource: 'WEBHOOK',
      resourceId: webhook.id,
      action: 'CREATE',
      updated: omit(updated, 'updatedAt'),
    });

    return updated;
  }

  @Patch('/:id')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Update a webhook',
    description: 'Modifies the specified webhook with new values.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the webhook to update.',
    type: Number,
  })
  @ApiResponse({
    status: 404,
    description: 'Webhook not found.',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook updated successfully.',
    type: WebhookSchema,
  })
  async update(
    @Param('id') id: number,
    @Req() req: express.Request,
    @Auth() auth: AuthContext,
    @Body() input: WebhookUpdateInputSchema,
  ): Promise<WebhookSchema> {
    try {
      const { result: webhook } = await this.prisma.webhook.findUniqueOrThrow({
        where: { id },
      });

      const { result: updated } = await this.prisma.webhook.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          secret: input.secret,
          hashLocation: input.hashLocation,
          hashAlgorithm: input.hashAlgorithm,
          hashKey: input.hashKey,
          active: input.active,
        },
        uncache: {
          uncacheKeys: [`webhook:${id}`],
        },
      });

      await this.activityService.recordActivity({
        req,
        userId: auth.user.id,
        resource: 'WEBHOOK',
        resourceId: webhook.id,
        action: 'UPDATE',
        data: omit(webhook, 'updatedAt'),
        updated: omit(updated, 'updatedAt'),
      });

      return updated;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new NotFoundException('Webhook not found.');
    }
  }

  @Delete('/:id')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Delete a webhook',
    description: 'Deletes a webhook permanently by its ID.',
  })
  @ApiResponse({
    status: 404,
    description: 'Webhook not found.',
  })
  @ApiResponse({
    status: 204,
    description: 'Webhook deleted successfully.',
  })
  @HttpCode(204)
  async delete(
    @Param('id') id: number,
    @Req() req: express.Request,
    @Auth() auth: AuthContext,
  ): Promise<void> {
    try {
      const { result: webhook } = await this.prisma.webhook.delete({
        where: { id },
        uncache: {
          uncacheKeys: [`webhook:${id}`],
        },
      });

      await this.activityService.recordActivity({
        req,
        userId: auth.user.id,
        resource: 'WEBHOOK',
        resourceId: id,
        action: 'DELETE',
        data: omit(webhook, 'updatedAt'),
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new NotFoundException('Webhook not found.');
    }
  }

  @Post('/:id/trigger')
  @ApiOperation({
    summary: 'Trigger webhook endpoint',
    description:
      'Triggers the specified webhook by validating a JWT token and optionally validating request hashes.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the webhook to trigger.',
    type: Number,
  })
  @ApiResponse({
    status: 400,
    description: 'Token is missing or request is malformed.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Token invalid or hash verification failed.',
  })
  @ApiResponse({
    status: 404,
    description: 'Webhook not found.',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook executed successfully.',
  })
  async trigger(
    @Req() req: RawBodyRequest<express.Request>,
    @Query('token') token: string,
  ): Promise<void> {
    if (!token) {
      throw new BadRequestException(
        'JWT token is required in the query string.',
      );
    }

    try {
      const jwt = await this.jwtService.verifyAsync<{ wid: number }>(token, {
        subject: 'access',
        audience: 'workflow',
        issuer: 'webhook',
      });

      const { result: webhook } = await this.prisma.webhook.findUnique({
        where: { id: jwt.wid },
        cache: {
          key: `webhook:${jwt.wid}`,
        },
      });

      if (!webhook) {
        throw new NotFoundException('Webhook not found.');
      }

      const flow = await this.workflowService.resolveClass(
        webhook.workflowId,
        true,
      );
      const config = await this.workflowService.getConfig(flow);

      if (!config?.webhook) {
        throw new BadRequestException(
          'The associated workflow does not support webhook triggers.',
        );
      }

      const { hashLocation, hashAlgorithm, hashKey, secret } = webhook;

      if (secret && hashLocation && hashAlgorithm && hashKey) {
        let hash: string | undefined;

        if (hashLocation === 'HEADER') {
          hash = req.header(hashKey);
        } else {
          hash = req.query[hashKey] as string;
        }

        if (!hash) {
          throw new BadRequestException(
            `Missing hash in ${hashLocation.toLowerCase()} (${hashKey}).`,
          );
        }

        const digest = crypto
          .createHmac(hashAlgorithm, secret)
          .update(req.rawBody!.toString('utf-8'))
          .digest('hex');

        const isValid = crypto.timingSafeEqual(
          Buffer.from(digest),
          Buffer.from(hash),
        );

        if (!isValid) {
          throw new UnauthorizedException(
            'Hash validation failed. You are not authorized to trigger this webhook.',
          );
        }
      }

      this.workflowService.run(flow, {
        draft: !webhook.active,
        trigger: 'WEBHOOK',
        triggerId: webhook.id.toString(),
        payload: req.body as unknown,
        // TODO: Add Sentry context
      });
    } catch (e: any) {
      if (e instanceof JsonWebTokenError) {
        throw new UnauthorizedException(
          'Invalid or expired token. Access denied.',
        );
      }

      throw e;
    }
  }
}

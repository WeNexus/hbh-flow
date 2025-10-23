import { ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ActivityService, PrismaService } from '#lib/core/services';
import { WorkflowService } from '#lib/workflow/workflow.service';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';
import { Auth, Protected } from '#lib/auth/decorators';
import { jobResEndSignal } from '#lib/workflow/misc';
import { ListInputSchema } from '#lib/core/schema';
import type { AuthContext } from '#lib/auth/types';
import { REDIS_SUB } from '#lib/core/redis';
import * as Sentry from '@sentry/nestjs';
import { Redis } from 'ioredis';
import express from 'express';
import crypto from 'crypto';

import {
  WebhookPayloadType,
  JobResMeta,
  RunOptions,
} from '#lib/workflow/types';

import {
  WebhookUpdateInputSchema,
  WebhookCreateInputSchema,
  WebhookListOutputSchema,
  WebhookSchema,
} from '../schema';

import {
  listData,
  PrismaWhereExceptionFilter,
  RUNTIME_ID,
} from '#lib/core/misc';

import {
  UnauthorizedException,
  BadRequestException,
  type RawBodyRequest,
  NotFoundException,
  UseFilters,
  Controller,
  HttpCode,
  Delete,
  Inject,
  Param,
  Query,
  Patch,
  Post,
  Body,
  Get,
  Req,
  Res,
} from '@nestjs/common';

@Controller('api/webhooks')
export class WebhookController {
  constructor(
    @Inject(RUNTIME_ID) private readonly runtimeId: string,
    private readonly workflowService: WorkflowService,
    private readonly activityService: ActivityService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_SUB) redisSub: Redis,
  ) {
    const redis = redisSub.duplicate();

    void redis
      .psubscribe(`jr:${this.runtimeId}:*`)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      .then(() => redis.on('pmessageBuffer', this.handleMessage.bind(this)));
  }

  private responses = new Map<
    number,
    {
      res: express.Response;
      metaSent: boolean;
    }
  >();

  private handleMessage(_: string, channel: Buffer, message: Buffer) {
    const jobId = Number(channel.toString().split(':').pop());

    if (!jobId || !this.responses.has(jobId)) {
      return;
    }

    const response = this.responses.get(jobId)!;
    const { res, metaSent } = response;

    if (!metaSent) {
      // First message is always meta
      response.metaSent = true;

      const meta = JSON.parse(message.toString()) as JobResMeta;

      if (meta.statusCode) {
        res.status(meta.statusCode);
      }

      if (meta.headers) {
        res.set(meta.headers);
      }

      return;
    }

    if (!jobResEndSignal.equals(message)) {
      res.write(message);
    } else {
      if (!res.writableEnded) {
        res.end();
      }

      this.responses.delete(jobId);
    }
  }

  private cleanupResponse(jobId: number, statusCode?: number) {
    if (this.responses.has(jobId)) {
      const response = this.responses.get(jobId)!;

      if (!response.res.writableEnded) {
        if (statusCode && !response.metaSent) {
          response.res.status(statusCode);
        }

        response.res.end();
      }

      this.responses.delete(jobId);
    }
  }

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

  @Post('/trigger')
  @ApiOperation({
    summary: 'Trigger webhook endpoint',
    description:
      'Triggers the specified webhook by validating a JWT token and optionally validating request hashes.',
  })
  @ApiQuery({
    name: 'token',
    description: 'JWT token for authenticating the webhook request.',
    required: true,
    type: String,
  })
  @ApiQuery({
    name: 'waitUntilCompleted',
    description:
      'If set, the request will wait for the workflow execution to complete before responding.',
    required: false,
    type: Boolean,
  })
  @ApiQuery({
    name: 'needResponse',
    description:
      'If set, the response from the workflow will be sent back to the requester.',
    required: false,
    type: Boolean,
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
    status: 201,
    description: 'Webhook executed successfully.',
  })
  async trigger(
    @Res() res: express.Response,
    @Req() req: RawBodyRequest<express.Request>,
    @Query('token') token: string,
    @Query('waitUntilCompleted') waitUntilCompleted?: boolean,
    @Query('needResponse') needResponse?: boolean,
  ): Promise<any> {
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

      let jobId: number;

      const trace = Sentry.getTraceData();

      let payload: unknown;

      switch (config.webhookPayloadType) {
        case WebhookPayloadType.Body:
          payload = req.body;
          break;
        case WebhookPayloadType.Headers:
          payload = req.headers;
          break;
        case WebhookPayloadType.Query:
          payload = req.query;
          break;
        case WebhookPayloadType.Full:
          payload = {
            body: req.body as unknown as Record<string, any>,
            headers: req.headers,
            query: req.query,
          };
          break;
        default:
          payload = (req.body ?? {}) as Record<string, any>;
      }

      const options: RunOptions = {
        draft: !webhook.active,
        needResponse: Boolean(needResponse),
        trigger: 'WEBHOOK',
        triggerId: webhook.id.toString(),
        payload: payload,
        sentry: {
          trace: trace['sentry-trace'],
          baggage: trace.baggage,
        },
        beforeQueue: (job) => {
          jobId = job.id;

          if (needResponse && webhook.active) {
            this.responses.set(jobId!, {
              res,
              metaSent: false,
            });
          }
        },
      };

      const { bullJob } = await this.workflowService
        .run(flow, options)
        .catch((e: Error) => {
          this.cleanupResponse(jobId ?? -1, 500);

          throw e;
        });

      if (webhook.active) {
        if (needResponse || waitUntilCompleted) {
          await bullJob!
            .waitUntilFinished(flow.queueEvents)
            .then(() => this.cleanupResponse(jobId, 201))
            .catch((e: Error) => {
              Sentry.captureException(e);
              this.cleanupResponse(jobId, 201);
            });
        } else {
          res.status(201).send();
        }
      }
    } catch (e: any) {
      if (e instanceof JsonWebTokenError) {
        throw new UnauthorizedException(
          'Invalid or expired token. Access denied.',
        );
      }

      throw e;
    }
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
      updated,
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
        data: webhook,
        updated,
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
        data: webhook,
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      throw new NotFoundException('Webhook not found.');
    }
  }
}

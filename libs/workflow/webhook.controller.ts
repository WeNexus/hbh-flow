import { Protected } from '#app/api/auth/decorators/protected.decorator.js';
import { WorkflowTokenOutput } from './misc/workflow-token.output.js';
import { WorkflowOptions } from './decorators/workflow.decorator.js';
import { WorkflowTokenInput } from './misc/workflow-token.input.js';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WorkflowService } from './workflow.service.js';
import { TriggerType } from './types/trigger-meta.js';
import { Reflector } from '@nestjs/core';
import express from 'express';

import {
  UnauthorizedException,
  BadRequestException,
  Controller,
  Post,
  Body,
  Req,
} from '@nestjs/common';

@Controller()
export class WebhookController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  @Post('api/webhook/token')
  @Protected('DEVELOPER')
  @ApiOperation({
    summary: 'Generate a webhook token for a workflow',
    description:
      'Generates a JWT token that can be used to authenticate webhook requests for a specific workflow.',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Workflow not found',
  })
  @ApiResponse({
    status: 200,
    description: 'Token generated successfully',
    type: WorkflowTokenOutput,
  })
  async generateWebhookToken(
    @Body() payload: WorkflowTokenInput,
  ): Promise<WorkflowTokenOutput> {
    const workflow = this.workflowService.workflowsByName.get(payload.workflow);

    if (!workflow) {
      throw new BadRequestException('Workflow not found');
    }

    const options = this.reflector.get<WorkflowOptions | undefined>(
      'HBH_FLOW',
      workflow,
    );

    if (
      !options?.triggers?.find(
        (trigger) => trigger.type === TriggerType.Webhook,
      )
    ) {
      throw new BadRequestException(
        'The specified workflow does not have a webhook trigger',
      );
    }

    const token = await this.jwtService.signAsync(
      { wflow: payload.workflow },
      {
        subject: 'access',
        audience: 'workflow',
        issuer: 'webhook',
        expiresIn: payload.expiresIn || '7d', // Default to 7 days if not specified
      },
    );

    return { token };
  }

  @Post('webhook/:token')
  @ApiOperation({
    summary: 'Webhook endpoint for workflows',
    description:
      'This endpoint is used to receive webhook requests for workflows. It validates the JWT token provided in the request. The token must be generated using the /api/webhook/token endpoint.',
  })
  async webhook(@Req() req: express.Request): Promise<void> {
    try {
      const jwt = await this.jwtService.verifyAsync<{ wflow: string }>(
        req.params.token,
        {
          subject: 'access',
          audience: 'workflow',
          issuer: 'webhook',
        },
      );

      const workflow = this.workflowService.workflowsByName.get(jwt.wflow);

      if (!workflow) {
        throw new BadRequestException(
          'Workflow not found for the provided token',
        );
      }

      this.workflowService.run(workflow, {
        payload: req.body as unknown,
        // TODO: Add Sentry context
      });

      console.log(req);
    } catch (e: any) {
      if (e instanceof JsonWebTokenError) {
        throw new UnauthorizedException(
          "You're not authorized to access this webhook",
        );
      }

      throw e; // Re-throw other errors
    }
  }
}

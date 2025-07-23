import { WorkflowTokenInputSchema, WorkflowTokenOutputSchema } from '../schema';
import { WorkflowService } from '#lib/workflow/workflow.service';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Auth, Protected } from '#lib/auth/decorators';
import { ActivityService } from '#lib/core/services';
import type { AuthContext } from '#lib/auth/types';
import { JsonWebTokenError } from '@nestjs/jwt';
import express from 'express';

import {
  NoWebhookTriggerException,
  WorkflowNotFoundException,
} from '#lib/workflow/exceptions';

import {
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Controller,
  Body,
  Post,
  Req,
} from '@nestjs/common';

@Controller()
export class WebhookController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly activityService: ActivityService,
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
    type: WorkflowTokenOutputSchema,
  })
  async generateWebhookToken(
    @Req() req: express.Request,
    @Auth() auth: AuthContext,
    @Body() payload: WorkflowTokenInputSchema,
  ): Promise<WorkflowTokenOutputSchema> {
    const workflow = this.workflowService.resolveClass(payload.workflow);

    if (!workflow) {
      throw new BadRequestException('Workflow not found');
    }

    try {
      const token = await this.workflowService.getToken(
        workflow,
        payload.key,
        payload.expiresIn ?? '7d',
      );

      // Log the activity of generating a webhook token
      await this.activityService.recordActivity({
        req,
        auth,
        resource: 'WORKFLOW',
        resourceId: (await this.workflowService.getDBFlow(workflow)).id,
        action: 'OTHER',
        subAction: 'GENERATE_WEBHOOK_TOKEN',
        details: {
          key: payload.key,
          expiresIn: payload.expiresIn,
        },
      });

      return {
        token,
      };
    } catch (e: any) {
      if (e instanceof NoWebhookTriggerException) {
        throw new BadRequestException(
          'The specified workflow does not have a webhook trigger',
        );
      }

      throw e; // Re-throw other errors
    }
  }

  @Post('webhook/:token')
  @ApiOperation({
    summary: 'Webhook endpoint for workflows',
    description:
      'This endpoint is used to receive webhook requests for workflows. It validates the JWT token provided in the request. The token must be generated using the /api/webhook/token endpoint.',
  })
  async webhook(@Req() req: express.Request): Promise<void> {
    try {
      await this.workflowService.handleWebhook(req.params.token, req.body);
    } catch (e: any) {
      if (e instanceof JsonWebTokenError) {
        throw new UnauthorizedException(
          "You're not authorized to access this webhook",
        );
      }

      if (e instanceof NoWebhookTriggerException) {
        throw new BadRequestException(
          'The specified workflow does not have a webhook trigger',
        );
      }

      if (e instanceof WorkflowNotFoundException) {
        throw new NotFoundException('Workflow not found');
      }

      throw e; // Re-throw other errors as is
    }
  }
}

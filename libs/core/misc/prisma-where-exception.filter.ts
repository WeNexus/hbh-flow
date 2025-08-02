import { ExceptionFilter, ArgumentsHost, Catch } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientValidationError)
export class PrismaWhereExceptionFilter implements ExceptionFilter {
  catch(_: Prisma.PrismaClientValidationError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    response.status(400).json({
      statusCode: 400,
      message: 'Invalid filter conditions: Please check your query parameters.',
    });
  }
}

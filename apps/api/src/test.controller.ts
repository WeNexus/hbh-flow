import { Controller, Get } from '@nestjs/common';

@Controller('/api')
export class TestController {
  @Get('/test')
  testEndpoint(): string {
    throw new Error('This is a test error for Sentry');
  }
}

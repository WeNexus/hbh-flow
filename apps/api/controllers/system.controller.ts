import { ApiExcludeController } from '@nestjs/swagger';
import { Controller, Get } from '@nestjs/common';
import { Protected } from '#lib/auth/decorators';

@Controller('api/system')
@ApiExcludeController()
export class SystemController {
  @Protected('DEVELOPER')
  @Get('variables')
  getVariables() {
    const env = { ...process.env };

    // Hide os variables that may contain sensitive information
    for (const key of Object.keys(env)) {
      if (key.startsWith('OS_') || key === 'PATH' || key === 'HOME') {
        env[key] = 'HIDDEN';
      }
    }

    return env;
  }
}

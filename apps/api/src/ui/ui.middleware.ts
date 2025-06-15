import { Injectable, NestMiddleware } from '@nestjs/common';
import { EnvService } from '#lib/core/env/env.service.js';
import path from 'node:path';

import express, {
  RequestHandler,
  NextFunction,
  Response,
  Request,
} from 'express';

@Injectable()
export class UIMiddleware implements NestMiddleware {
  private readonly appPath = path.join(
    import.meta.dirname,
    '../../../ui',
  );
  private readonly staticMiddleware: RequestHandler;
  private proxyMiddleware?: RequestHandler;

  constructor(private readonly env: EnvService) {
    this.staticMiddleware = express.static(this.appPath, { fallthrough: true });

    if (!env.isProd) {
      import('http-proxy-middleware')
        .then(({ createProxyMiddleware }) => {
          this.proxyMiddleware = createProxyMiddleware({
            target: `http://localhost:${env.getNumber('UI_PORT', 3002)}`,
          });
        })
        .catch((e) => {
          console.error('Failed to load http-proxy-middleware:', e);
        });
    }
  }

  async use(req: Request, res: Response, next: NextFunction) {
    if (req.path.startsWith('/api')) {
      return next();
    }

    if (!this.env.isProd && this.proxyMiddleware) {
      return this.proxyMiddleware(req, res, next);
    }

    await this.staticMiddleware(req, res, () => {
      const extension = path.extname(req.path);

      if (!extension) {
        return res.sendFile(path.join(this.appPath, 'index.html'));
      }

      return res.status(404).send();
    });
  }
}

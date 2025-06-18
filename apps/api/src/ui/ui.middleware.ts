import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
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
  private readonly appPath = path.join(import.meta.dirname, '../../../../dist');
  private readonly logger = new Logger(UIMiddleware.name);

  private readonly staticMiddleware?: RequestHandler;
  private proxyMiddleware?: RequestHandler;

  constructor(private readonly env: EnvService) {
    if (!env.isProd) {
      // In development, use http-proxy-middleware to proxy requests to the Vite server
      import('http-proxy-middleware')
        .then(({ createProxyMiddleware }) => {
          this.proxyMiddleware = createProxyMiddleware({
            target: `http://localhost:${env.getNumber('UI_PORT', 3002)}`,
            ws: true,
          });
        })
        .catch((e) => {
          this.logger.error('Failed to load http-proxy-middleware:', e);
        });
    } else {
      // In production, serve static files directly from the dist directory
      this.staticMiddleware = express.static(this.appPath, {
        fallthrough: true,
      });
    }
  }

  async use(req: Request, res: Response, next: NextFunction) {
    if (!this.env.isProd) {
      if (this.proxyMiddleware) {
        return this.proxyMiddleware(req, res, next);
      }

      throw new Error('Proxy middleware is not initialized');
    }

    if (this.staticMiddleware) {
      await this.staticMiddleware(req, res, () => {
        const extension = path.extname(req.path);

        if (!extension) {
          return res.sendFile(path.join(this.appPath, 'index.html'));
        }

        return res.status(404).send();
      });
    } else {
      throw new Error('Static middleware is not initialized');
    }
  }
}

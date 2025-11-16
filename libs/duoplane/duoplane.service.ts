import type { RequestConfig, TokenClientOptions } from '#lib/hub/types';
import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { TokenHttpClient } from '#lib/hub/clients';
import { EnvService } from '#lib/core/env';
import { Reflector } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Client } from '#lib/hub/misc';
import * as https from 'node:https';
import { merge } from 'lodash-es';

@Client('token', {
  id: 'duoplane',
  name: 'Duoplane',
  icon: 'https://support.duoplane.com/hc/theming_assets/01HZGZBT8ND0T6ZP924DJK0KME',
})
export class DuoplaneService extends TokenHttpClient {
  constructor(reflector: Reflector, env: EnvService) {
    super(
      merge(
        reflector.get<TokenClientOptions>('HBH_HUB_CLIENT', DuoplaneService),
        {
          connections: [
            {
              id: 'miami_distro',
              description: 'Miami Distro Duoplane Connection',
              tokens: {
                key: env.getString('MIAMI_DISTRO_DUOPLANE_KEY'),
                secret: env.getString('MIAMI_DISTRO_DUOPLANE_SECRET'),
              },
            },
          ],
        },
      ),
    );
  }

  private logger = new Logger(DuoplaneService.name);

  protected defaultConfig(): Promise<AxiosRequestConfig> | AxiosRequestConfig {
    const ipv4Agent = new https.Agent({ family: 4 });

    // Validate the connection
    return {
      baseURL: 'https://app.duoplane.com',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 1000 * 60 * 15, // 15 minutes
      httpsAgent: ipv4Agent,
      validateStatus: (status) => status >= 200 && status < 300, // Accept only 2xx responses
    };
  }

  protected intercept(
    config: RequestConfig,
  ): Promise<RequestConfig> | RequestConfig {
    if (config.noAuth) {
      return config;
    }

    const token = this.getToken(config.connection);

    config.auth = {
      username: token.key,
      password: token.secret,
    };

    return config;
  }

  async testConnection(connection: string): Promise<boolean> {
    const res = await this.get(
      '/purchase_orders.json?search[updated_at_min]=2021-05-01T02:00:00Z&page=1&per_page=1',
      {
        connection,
      },
    );

    return res.status === 200;
  }

  override async request<T = any, D = any>(
    config: RequestConfig<D>,
  ): Promise<AxiosResponse<T>> {
    let res: AxiosResponse<T>;
    let retryAfter: number | null = null;

    const makeRequest = async () => {
      try {
        res = await super.request<T, D>(config);
      } catch (e: any) {
        if (e instanceof AxiosError) {
          res = e.response as AxiosResponse<T>;
        } else {
          throw e;
        }
      }

      retryAfter = Number(res.headers['duoplane-retry-after-seconds'] || 0);

      if (retryAfter > 0) {
        this.logger.warn(
          `Rate limit reached. Retrying after ${retryAfter} seconds...`,
        );
      }
    };

    do {
      await makeRequest();

      if (retryAfter && retryAfter > 0) {
        await new Promise((r) => setTimeout(r, (retryAfter! + 0.5) * 1000));
      }
    } while (retryAfter && retryAfter > 0);

    return res!;
  }
}

import type { RequestConfig, TokenClientOptions } from '#lib/hub/types';
import { TokenHttpClient } from '#lib/hub/clients';
import { AxiosRequestConfig } from 'axios';
import { EnvService } from '#lib/core/env';
import { Reflector } from '@nestjs/core';
import { Client } from '#lib/hub/misc';
import { merge } from 'lodash-es';

@Client('token', {
  id: 'flodesk',
  name: 'Flodesk',
  icon: 'https://flodesk.com/blog/wp-content/uploads/2022/01/Small_Placement_Logo.png',
})
export class FlodeskService extends TokenHttpClient {
  constructor(reflector: Reflector, env: EnvService) {
    super(
      merge(
        reflector.get<TokenClientOptions>('HBH_HUB_CLIENT', FlodeskService),
        {
          connections: [
            {
              id: 'default',
              description: 'Default Flodesk connection',
              tokens: {
                apiKey: env.getString('FLODESK_API_KEY'),
              },
            },
          ],
        },
      ),
    );
  }

  protected defaultConfig(
    connection: string,
  ): Promise<AxiosRequestConfig> | AxiosRequestConfig {
    // Validate the connection
    this.getToken(connection);

    return {
      baseURL: ` https://api.flodesk.com/v1`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 1000 * 60 * 15, // 15 minutes
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
      username: token.apiKey,
      password: '',
    };

    return config;
  }

  async testConnection(connection: string): Promise<boolean> {
    const res = await this.get('/segments', {
      connection,
      params: {
        per_page: 1,
      },
    });

    return res.status === 200;
  }
}

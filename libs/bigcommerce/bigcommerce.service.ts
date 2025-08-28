import type { RequestConfig, TokenClientOptions } from '#lib/hub/types';
import { TokenHttpClient } from '#lib/hub/clients';
import { AxiosRequestConfig } from 'axios';
import { EnvService } from '#lib/core/env';
import { Reflector } from '@nestjs/core';
import { Client } from '#lib/hub/misc';
import { merge } from 'lodash-es';

@Client('token', {
  id: 'bigcommerce',
  name: 'BigCommerce',
  icon: 'https://www.bigcommerce.com/_next/image/?url=https%3A%2F%2Fstorage.googleapis.com%2Fs.mkswft.com%2FRmlsZTo3NzQyZWFmYy1iMTY5LTQxNzItYTcxNi1iNWRjNzA1YWRjMDA%3D%2Fbg-image.webp&w=1920&q=75',
})
export class BigCommerceService extends TokenHttpClient {
  constructor(reflector: Reflector, env: EnvService) {
    super(
      merge(
        reflector.get<TokenClientOptions>('HBH_HUB_CLIENT', BigCommerceService),
        {
          connections: [
            {
              id: 'hbh',
              description: 'HBH BigCommerce Connection',
              tokens: {
                accessToken: env.getString('HBH_BIGCOMMERCE_ACCESS_TOKEN'),
                storeHash: env.getString('HBH_BIGCOMMERCE_STORE_HASH'),
              },
            },
            {
              id: 'dispomart',
              description: 'Dispomart BigCommerce Connection',
              tokens: {
                accessToken: env.getString('DM_BIGCOMMERCE_ACCESS_TOKEN'),
                storeHash: env.getString('DM_BIGCOMMERCE_STORE_HASH'),
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
    const tokens = this.getToken(connection);

    return {
      baseURL: `https://api.bigcommerce.com/stores/${tokens.storeHash}`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 10000, // 10 seconds
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

    const headers = config.headers || {};
    headers['X-Auth-Token'] = token.accessToken;
    config.headers = headers;

    return config;
  }

  async testConnection(connection: string): Promise<boolean> {
    const res = await this.get('/v2/store', {
      connection,
    });

    return res.status === 200;
  }
}

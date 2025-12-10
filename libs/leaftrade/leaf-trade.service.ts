import type { RequestConfig, TokenClientOptions } from '#lib/hub/types';
import { TokenHttpClient } from '#lib/hub/clients';
import { AxiosRequestConfig } from 'axios';
import { EnvService } from '#lib/core/env';
import { Reflector } from '@nestjs/core';
import { Client } from '#lib/hub/misc';
import { merge } from 'lodash-es';

@Client('token', {
  id: 'leaftrade',
  name: 'Leaf Trade',
  icon: 'https://leaf.trade/wp-content/uploads/2023/04/Logo_green_outline.svg',
})
export class LeafTradeService extends TokenHttpClient {
  constructor(reflector: Reflector, env: EnvService) {
    super(
      merge(
        reflector.get<TokenClientOptions>('HBH_HUB_CLIENT', LeafTradeService),
        {
          connections: [
            {
              id: 'cannadevice',
              description: 'Cannadevice Leaf Trade Connection',
              tokens: {
                apiKey: env.getString('LEAF_TRADE_CANNADEVICE_TOKEN'),
              },
            },
          ],
        },
      ),
    );
  }

  protected defaultConfig(): Promise<AxiosRequestConfig> | AxiosRequestConfig {
    // Validate the connection

    return {
      baseURL: 'https://app.leaf.trade/api',
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

    const headers = config.headers || {};
    headers['Authorization'] = `Token ${token.apiKey}`;
    config.headers = headers;

    return config;
  }

  async testConnection(connection: string): Promise<boolean> {
    const res = await this.get('/v3/tokens', {
      connection,
    });

    console.log(res.data);

    return res.status === 200;
  }
}

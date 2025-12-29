import type { RequestConfig, TokenClientOptions } from '#lib/hub/types';
import { TokenHttpClient } from '#lib/hub/clients';
import { AxiosRequestConfig } from 'axios';
import { EnvService } from '#lib/core/env';
import { Reflector } from '@nestjs/core';
import { Client } from '#lib/hub/misc';
import { merge } from 'lodash-es';

@Client('token', {
  id: 'apex_trading',
  name: 'Apex Trading',
  icon: 'https://www.apextrading.com/images/logos/logo.svg',
})
export class ApexTradingService extends TokenHttpClient {
  constructor(reflector: Reflector, env: EnvService) {
    super(
      merge(
        reflector.get<TokenClientOptions>('HBH_HUB_CLIENT', ApexTradingService),
        {
          connections: [
            {
              id: 'dispomart',
              description: 'Apex Trading HBH Connection',
              tokens: {
                apiKey: env.getString('APEX_TRADING_DM_API_KEY'),
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
      baseURL: 'https://app.apextrading.com/api',
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
    headers.Authorization = `Bearer ${token.apiKey}`;
    config.headers = headers;

    return config;
  }

  async testConnection(connection: string): Promise<boolean> {
    try {
      await this.get('/v1/welcome', { connection });
    } catch {
      return false;
    }

    return true;
  }
}

import type { RequestConfig, TokenClientOptions } from '#lib/hub/types';
import { ProductStock } from './types/product-stock';
import { TokenHttpClient } from '#lib/hub/clients';
import { AxiosRequestConfig } from 'axios';
import { EnvService } from '#lib/core/env';
import { Reflector } from '@nestjs/core';
import { Client } from '#lib/hub/misc';
import { merge } from 'lodash-es';

@Client('token', {
  id: 'fujimausa',
  name: 'East West',
  icon: 'https://fujimausa.com/assets/images/logo.png',
})
export class FujimausaService extends TokenHttpClient {
  constructor(reflector: Reflector, env: EnvService) {
    super(
      merge(
        reflector.get<TokenClientOptions>('HBH_HUB_CLIENT', FujimausaService),
        {
          connections: [
            {
              id: 'default',
              description: 'Default Fujimausa Connection',
              tokens: {
                apiKey: env.getString('FUJIMAUSA_API_KEY'),
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
      baseURL: 'https://api.fujimausa.com/Fujimausa',
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
    headers.ApiKey = token.apiKey;
    config.headers = headers;

    return config;
  }

  async getUnitOnHand(
    productCode: string | string[],
    connection = 'default',
  ): Promise<ProductStock[]> {
    const res = await this.post<{ response: ProductStock[] }>(
      '/GetProductStock',
      {
        ProdCode: Array.isArray(productCode)
          ? productCode.join(',')
          : productCode,
      },
      {
        connection,
      },
    );

    return res.data.response;
  }

  async testConnection(connection: string): Promise<boolean> {
    await this.getUnitOnHand('TEST_PRODUCT_CODE', connection);

    return true;
  }
}

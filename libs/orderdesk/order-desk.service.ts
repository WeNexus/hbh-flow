import type { RequestConfig, TokenClientOptions } from '#lib/hub/types';
import { TokenHttpClient } from '#lib/hub/clients';
import { AxiosRequestConfig } from 'axios';
import { EnvService } from '#lib/core/env';
import { Reflector } from '@nestjs/core';
import { Client } from '#lib/hub/misc';
import { merge } from 'lodash-es';

@Client('token', {
  id: 'orderdesk',
  name: 'Order Desk',
  icon: 'https://www.orderdesk.com/wp-content/uploads/2024/11/ODlogo-horizontal-white-nofx-r-1500-265x40.png',
})
export class OrderDeskService extends TokenHttpClient {
  constructor(reflector: Reflector, env: EnvService) {
    super(
      merge(
        reflector.get<TokenClientOptions>('HBH_HUB_CLIENT', OrderDeskService),
        {
          connections: [
            {
              id: 'day1distro',
              description: 'Day 1 Distro BigCommerce Connection',
              tokens: {
                accessToken: env.getString(
                  'DAY1_DISTRO_ORDER_DESK_ACCESS_TOKEN',
                ),
                storeId: env.getString('DAY1_DISTRO_ORDER_DESK_STORE_ID'),
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
      baseURL: `https://app.orderdesk.me/api`,
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
    headers['ORDERDESK-STORE-ID'] = token.storeId;
    headers['ORDERDESK-API-KEY'] = token.accessToken;
    config.headers = headers;

    return config;
  }

  async testConnection(connection: string): Promise<boolean> {
    const res = await this.get('/v2/test', {
      connection,
    });

    return res.status === 200;
  }
}

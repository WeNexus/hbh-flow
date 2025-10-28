import type { RequestConfig, TokenClientOptions } from '#lib/hub/types';
import { TokenHttpClient } from '#lib/hub/clients';
import { EnvService } from '#lib/core/env';
import { AxiosRequestConfig } from 'axios';
import { Reflector } from '@nestjs/core';
import { Client } from '#lib/hub/misc';
import { merge } from 'lodash-es';

@Client('token', {
  id: 'odoo',
  name: 'Odoo',
  icon: 'https://www.odoo.com/documentation/19.0/_static/img/logos/odoo_logo.svg',
})
export class OdooService extends TokenHttpClient {
  constructor(reflector: Reflector, env: EnvService) {
    super(
      merge(reflector.get<TokenClientOptions>('HBH_HUB_CLIENT', OdooService), {
        connections: [
          {
            id: 'ryot',
            description: 'RYOT Odoo Connection',
            tokens: {
              database: env.getString('RYOT_ODO_DATABASE'),
              apiKey: env.getString('RYOT_ODO_API_KEY'),
            },
          },
        ],
      }),
    );
  }

  protected defaultConfig(
    connection: string,
  ): Promise<AxiosRequestConfig> | AxiosRequestConfig {
    const tokens = this.getToken(connection);

    return {
      baseURL: `https://${tokens.database}.odoo.com`,
      headers: {
        'X-Odoo-Database': tokens.database,
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

    const tokens = this.getToken(config.connection);

    const headers = config.headers || {};
    headers['Authorization'] = `Bearer ${tokens.apiKey}`;
    config.headers = headers;

    return config;
  }

  async testConnection(connection: string): Promise<boolean> {
    try {
      await this.post(
        '/json/2/res.company/search_read',
        {
          domain: [['display_name', 'ilike', '']],
          fields: ['display_name'],
          limit: 1,
        },
        {
          connection,
        },
      );

      return true;
    } catch {
      return false;
    }
  }

  async getCountryAndStateId(
    connection: string,
    countryCode: string,
    stateCode: string,
  ) {
    const { data: countries } = await this.post<number[]>(
      '/json/2/res.country/search',
      {
        domain: [['code', '=ilike', countryCode]],
      },
      {
        connection,
      },
    );

    const { data: states } = await this.post<number[]>(
      '/json/2/res.country.state/search',
      {
        domain: [
          ['country_id', '=', countries[0]],
          ['code', '=ilike', stateCode],
        ],
      },
      {
        connection,
      },
    );

    return {
      countryId: countries[0],
      stateId: states[0],
    };
  }
}

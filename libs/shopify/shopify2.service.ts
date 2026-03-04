import { Client, OAUTH2_CLIENT_OPTIONS } from '#lib/hub/misc';
import { GQLInput, GQLResponse } from '#lib/shopify/types';
import type { OAuth2ClientOptions } from '#lib/hub/types';
import { ModuleRef, Reflector } from '@nestjs/core';
import { OAuth2HttpClient } from '#lib/hub/clients';
import { ApiVersion } from '@shopify/shopify-api';
import { AxiosRequestConfig } from 'axios';
import { EnvService } from '#lib/core/env';
import { Inject } from '@nestjs/common';
import { merge } from 'lodash-es';

@Client('oauth2', {
  id: 'shopify-2',
  name: 'Shopify OAuth2',
  icon: 'https://cdn.shopify.com/shopifycloud/brochure/assets/brand-assets/shopify-logo-primary-logo-456baa801ee66a0a435671082365958316831c9960c480451dd0330bcdae304f.svg',
  scopes: [
    'read_assigned_fulfillment_orders',
    'write_assigned_fulfillment_orders',
    'read_customers',
    'write_customers',
    'read_price_rules',
    'write_price_rules',
    'read_discounts',
    'write_discounts',
    'write_draft_orders',
    'read_draft_orders',
    'read_fulfillments',
    'write_fulfillments',
    'write_inventory',
    'read_inventory',
    'read_locations',
    'read_metaobjects',
    'write_metaobjects',
    'read_orders',
    'write_orders',
    'read_products',
    'write_products',
    'customer_read_orders',
    'customer_write_orders',
  ],
})
export class Shopify2Service extends OAuth2HttpClient {
  constructor(reflector: Reflector, moduleRef: ModuleRef, env: EnvService) {
    super(
      moduleRef,
      merge(
        {
          clientId: env.getString('SHOPIFY2_HUB_CLIENT_ID', ''),
          clientSecret: env.getString('SHOPIFY2_HUB_CLIENT_SECRET', ''),
          connections: [
            {
              id: 'miamidistro',
              description: 'MiamiDistro Shopify Store',
              authorizationURL:
                'https://miamidistro.myshopify.com/admin/oauth/authorize',
              tokenURL:
                'https://miamidistro.myshopify.com/admin/oauth/access_token',
            },
          ],
        },
        reflector.get<OAuth2ClientOptions>('HBH_HUB_CLIENT', Shopify2Service),
      ),
      env,
    );
  }

  protected defaultConfig(connection: string): AxiosRequestConfig {
    return {
      baseURL: `https://${connection}.myshopify.com/admin/api/${ApiVersion.April26}/`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 1000 * 60 * 15, // 15 minutes
      validateStatus: (status) => status >= 200 && status < 300, // Accept only 2xx responses
    };
  }

  protected async intercept(
    config: AxiosRequestConfig,
  ): Promise<AxiosRequestConfig> {
    const headers = config.headers || {};
    const connection = config['connection'] as string;
    const tokens = await this.getToken(connection);

    if (!tokens?.access) {
      throw new Error(`No access token for connection ${connection}`);
    }

    headers['X-Shopify-Access-Token'] = tokens.access;
    config.headers = headers;

    return config;
  }

  async gql<R = any>(input: GQLInput): Promise<GQLResponse<R>> {
    const { data } = await this.post<{
      data?: Record<string, any>;
      errors?: { message: string; locations?: []; extensions?: [] }[];
    }>(
      '/admin/api/2025-10/graphql.json',
      {
        query: input.query,
        variables: input.variables || {},
      },
      {
        connection: input.connection,
      },
    );

    if (data.errors?.length) {
      throw new Error(
        `Shopify GQL Error: ${data.errors.map((e) => e.message).join(', ')}`,
      );
    }

    return data.data?.[input.root] as GQLResponse<R>;
  }

  async getUserInfo(connection: string) {
    const data = await this.gql<Record<string, any>>({
      connection,
      query: `#graphql
        query {
          shop {
            name
            email
            myshopifyDomain
          }
        }`,
      root: 'shop',
    });

    return {
      name: data.name,
      domain: data.myshopifyDomain,
    };
  }

  async validateSession(token: string) {
    console.log(`Validating session for token: ${token}`);
    // TODO: implement
  }
}

import { GQLInput, GQLResponse } from '#lib/shopify/types';
import type { OAuth2ClientOptions } from '#lib/hub/types';
import { UnauthorizedException } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { OAuth2HttpClient } from '#lib/hub/clients';
import { ApiVersion } from '@shopify/shopify-api';
import { AxiosRequestConfig } from 'axios';
import { EnvService } from '#lib/core/env';
import { Client } from '#lib/hub/misc';
import type { Request } from 'express';
import { merge } from 'lodash-es';
import crypto from 'crypto';

@Client('oauth2', {
  id: 'shopify-2',
  name: 'Shopify OAuth2',
  icon: 'https://cdn.shopify.com/shopifycloud/brochure/assets/brand-assets/shopify-logo-primary-logo-456baa801ee66a0a435671082365958316831c9960c480451dd0330bcdae304f.svg',
  scopes: [
    'read_assigned_fulfillment_orders',
    'write_assigned_fulfillment_orders',
    'write_draft_orders',
    'read_draft_orders',
    'read_merchant_managed_fulfillment_orders',
    'write_merchant_managed_fulfillment_orders',
    'write_order_edits',
    'read_order_edits',
    'read_orders',
    'write_orders',
    'read_products',
    'write_products',
    'read_third_party_fulfillment_orders',
    'write_third_party_fulfillment_orders',
    'read_customers',
    'write_customers',
    'read_price_rules',
    'write_price_rules',
    'read_discounts',
    'write_discounts',
    'read_fulfillments',
    'write_fulfillments',
    'write_inventory',
    'read_inventory',
    'read_locations',
    'read_metaobjects',
    'write_metaobjects',
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
            {
              id: 'canna-devices',
              description: 'New Cannadevices Shopify Store',
              authorizationURL:
                'https://canna-devices.myshopify.com/admin/oauth/authorize',
              tokenURL:
                'https://canna-devices.myshopify.com/admin/oauth/access_token',
              clientId: env.getString('CANNADEVICE_NEW_CLIENT_ID'),
              clientSecret: env.getString('CANNADEVICE_NEW_CLIENT_SECRET'),
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
      '/graphql.json',
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

  landingPage(connectionId: string, req: Request) {
    const connection = this.clientOptions.connections.find(
      (c) => c.id === connectionId,
    )!;

    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const expectedHmac = req.query.hmac?.toString();

    if (!expectedHmac) {
      throw new UnauthorizedException(
        'Missing HMAC signature for verification.',
      );
    }

    const searchParams = new URLSearchParams(
      Object.entries(req.query as Record<string, any>)
        .filter(([key]) => key !== 'hmac') // Exclude HMAC from params used for verification
        .sort(([a], [b]) => a.codePointAt(0) - b.codePointAt(0)), // Sort params alphabetically by key
    );

    // Create HMAC-SHA256 digest
    const generatedHmac = crypto
      .createHmac(
        'sha256',
        connection.clientSecret ?? this.clientOptions.clientSecret,
      )
      .update(searchParams.toString(), 'utf8')
      .digest('hex');

    const isValid = this.secureCompare(generatedHmac, expectedHmac);

    if (!isValid) {
      throw new UnauthorizedException(
        'Invalid HMAC signature. Possible tampering detected.',
      );
    }

    return `
      <h1 style="margin-left: auto; margin-right: auto; text-align: center;">
        ? Successfully connected to Shopify (${connectionId})!.
        
        <code>
          ${JSON.stringify(req.query, null, 2)}
        </code>
      </h1>
    `;
  }

  private secureCompare(a: string, b: string): boolean {
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');

    // Length check is required before timingSafeEqual
    if (aBuf.length !== bBuf.length) return false;

    return crypto.timingSafeEqual(aBuf, bBuf);
  }
}

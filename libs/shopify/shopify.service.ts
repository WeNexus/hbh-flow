import { GQLInput, GQLResponse, StagedUploadInput } from './types';
import type { TokenClientOptions } from '#lib/hub/types';
import { TokenHttpClient } from '#lib/hub/clients';
import axios, { AxiosRequestConfig } from 'axios';
import { EnvService } from '#lib/core/env';
import { Reflector } from '@nestjs/core';
import { Client } from '#lib/hub/misc';
import { merge } from 'lodash-es';

@Client('token', {
  id: 'shopify',
  name: 'Shopify',
  icon: 'https://cdn.shopify.com/shopifycloud/brochure/assets/brand-assets/shopify-logo-primary-logo-456baa801ee66a0a435671082365958316831c9960c480451dd0330bcdae304f.svg',
})
export class ShopifyService extends TokenHttpClient {
  constructor(reflector: Reflector, env: EnvService) {
    super(
      merge(
        reflector.get<TokenClientOptions>('HBH_HUB_CLIENT', ShopifyService),
        {
          connections: [
            {
              id: 'hbh_wholesale',
              description: 'HBH Wholesale Shopify Store',
              tokens: {
                accessToken: env.getString('SHOPIFY_HBH_WS_ACCESS_TOKEN'),
                storeUrl: env.getString('SHOPIFY_HBH_WS_STORE_URL'),
              },
            },
            {
              id: 'hbh_retail',
              description: 'HBH Retail Shopify Store',
              tokens: {
                accessToken: env.getString('SHOPIFY_HBH_RT_ACCESS_TOKEN'),
                storeUrl: env.getString('SHOPIFY_HBH_RT_STORE_URL'),
              },
            },
            {
              id: 'fat_ass',
              description: 'Fat Ass Glass Shopify Store',
              tokens: {
                accessToken: env.getString('FAT_ASS_GLASS_ACCESS_TOKEN'),
                storeUrl: env.getString('FAT_ASS_GLASS_STORE_URL'),
              },
            },
          ],
        },
      ),
    );
  }

  protected defaultConfig(connection: string): AxiosRequestConfig {
    const tokens = this.getToken(connection);

    return {
      baseURL: `https://${tokens.storeUrl}`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 1000 * 60 * 15, // 15 minutes
      validateStatus: (status) => status >= 200 && status < 300, // Accept only 2xx responses
    };
  }

  protected intercept(
    config: AxiosRequestConfig,
  ): Promise<AxiosRequestConfig> | AxiosRequestConfig {
    const headers = config.headers || {};
    const connection = config['connection'] as string;
    const tokens = this.getToken(connection);

    if (!tokens?.accessToken) {
      throw new Error(`No access token for connection ${connection}`);
    }

    headers['X-Shopify-Access-Token'] = tokens.accessToken;
    config.headers = headers;

    return config;
  }

  async testConnection(connection: string) {
    try {
      const shop = await this.gql<Record<string, any>>({
        connection,
        query: `#graphql
        query {
          shop {
            name
          }
        }`,
        root: 'shop',
      });

      return !!shop?.name;
    } catch {
      return false;
    }
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

  async doStagedUpload(input: StagedUploadInput) {
    const { stagedTargets } = await this.gql<{
      stagedTargets: {
        url: string;
        resourceUrl: string;
        parameters: { name: string; value: string }[];
      }[];
    }>({
      connection: input.connection,
      root: 'stagedUploadsCreate',
      variables: {
        input: {
          resource: input.resource,
          filename: input.filename,
          mimeType: input.mimeType,
          httpMethod: input.httpMethod,
        },
      },
      query: `#graphql
      mutation ($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
      `,
    });

    const formData = axios.toFormData({});

    for (const param of stagedTargets[0].parameters) {
      formData.append(param.name, param.value);
    }

    formData.append(
      'file',
      typeof input.data === 'string' ? Buffer.from(input.data) : input.data,
    );

    void axios.post(stagedTargets[0].url, formData);

    return {
      filePath: stagedTargets[0].parameters.find((p) => p.name === 'key')!
        .value,
      resourceUrl: stagedTargets[0].resourceUrl,
    };
  }
}

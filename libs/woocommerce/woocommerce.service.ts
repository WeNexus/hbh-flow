import WooCommerceRestApi, { WooRestApiOptions } from 'woocommerce-rest-ts-api';
import type { TokenClientOptions } from '#lib/hub/types';
import { TokenClient } from '#lib/hub/clients';
import { EnvService } from '#lib/core/env';
import { Reflector } from '@nestjs/core';
import { Client } from '#lib/hub/misc';
import { merge } from 'lodash-es';

@Client('token', {
  id: 'woocommerce',
  name: 'WooCommerce',
  icon: 'https://woocommerce.com/wp-content/uploads/2025/01/Logo-Primary.png',
})
export class WoocommerceService extends TokenClient {
  constructor(reflector: Reflector, env: EnvService) {
    super(
      merge(
        reflector.get<TokenClientOptions>('HBH_HUB_CLIENT', WoocommerceService),
        {
          connections: [
            {
              id: 'miami_distro',
              description: 'Miami Distro WooCommerce Connection',
              tokens: {
                consumerKey: env.getString('MIAMI_DISTRO_WC_KEY'),
                consumerSecret: env.getString('MIAMI_DISTRO_WC_SECRET'),
                storeUrl: env.getString('MIAMI_DISTRO_WC_STORE_URL'),
              },
            },
            {
              id: 'savage_me_dolls',
              description: 'Savage Me Dolls WooCommerce Connection',
              tokens: {
                consumerKey: env.getString('SAVAGE_ME_DOLLS_WC_KEY'),
                consumerSecret: env.getString('SAVAGE_ME_DOLLS_WC_SECRET'),
                storeUrl: env.getString('SAVAGE_ME_DOLLS_WC_STORE_URL'),
              },
            },
            {
              id: 'the_delta_boss',
              description: 'The Delta Boss WooCommerce Connection',
              tokens: {
                consumerKey: env.getString('THE_DELTA_BOSS_WC_KEY'),
                consumerSecret: env.getString('THE_DELTA_BOSS_WC_SECRET'),
                storeUrl: env.getString('THE_DELTA_BOSS_WC_STORE_URL'),
              },
            },
            {
              id: 'shop_full_circle',
              description: 'Shop Full Circle WooCommerce Connection',
              tokens: {
                consumerKey: env.getString('SHOP_FULL_CIRCLE_WC_KEY'),
                consumerSecret: env.getString('SHOP_FULL_CIRCLE_WC_SECRET'),
                storeUrl: env.getString('SHOP_FULL_CIRCLE_WC_STORE_URL'),
              },
            },
            /*{
              id: 'shop_be_savage',
              description: 'Shop be Savage WooCommerce Connection',
              tokens: {
                consumerKey: env.getString('SHOP_BE_SAVAGE_WC_KEY'),
                consumerSecret: env.getString('SHOP_BE_SAVAGE_WC_SECRET'),
                storeUrl: env.getString('SHOP_BE_SAVAGE_WC_STORE_URL'),
              },
            },*/
          ],
        },
      ),
    );
  }

  private readonly clients = new Map<
    string,
    WooCommerceRestApi<WooRestApiOptions>
  >();

  getClient(connection: string): WooCommerceRestApi<WooRestApiOptions> {
    let client = this.clients.get(connection);

    if (client) {
      return client;
    }

    const tokens = this.getToken(connection);

    client = new WooCommerceRestApi<WooRestApiOptions>({
      url: tokens.storeUrl,
      consumerKey: tokens.consumerKey,
      consumerSecret: tokens.consumerSecret,
      version: 'wc/v3',
      queryStringAuth: true,
      timeout: 1000 * 60 * 5, // 5 minutes
    });

    this.clients.set(connection, client);

    return client;
  }

  async testConnection(connection: string): Promise<boolean> {
    try {
      const client = this.getClient(connection);
      await client.getSystemStatus();

      return true;
    } catch {
      return false;
    }
  }
}

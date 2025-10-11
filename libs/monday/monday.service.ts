import { ApiClient, GetMeOpQuery } from '@mondaydotcomorg/api';
import { Client, OAUTH2_CLIENT_OPTIONS } from '#lib/hub/misc';
import type { OAuth2ClientOptions } from '#lib/hub/types';
import { OAuth2Client } from '#lib/hub/clients';
import { EnvService } from '#lib/core/env';
import { ModuleRef } from '@nestjs/core';
import { Inject } from '@nestjs/common';
import { SetRequired } from 'type-fest';

@Client('oauth2', {
  id: 'monday',
  name: 'Monday',
  icon: 'https://dapulse-res.cloudinary.com/image/upload/f_auto,q_auto/remote_mondaycom_static/img/monday-logo-x2.png',
  scopes: [
    'me:read',
    'boards:read',
    'boards:write',
    'workspaces:read',
    'account:read',
    'webhooks:read',
    'webhooks:write',
  ],
  connections: [
    {
      id: 'hbh',
      description: 'Honeybee Herb Monday Connection',
      authorizationURL: 'https://auth.monday.com/oauth2/authorize',
      tokenURL: 'https://auth.monday.com/oauth2/token',
    },
  ],
})
export class MondayService extends OAuth2Client {
  constructor(
    moduleRef: ModuleRef,
    @Inject(OAUTH2_CLIENT_OPTIONS) options: OAuth2ClientOptions,
    env: EnvService,
  ) {
    super(
      moduleRef,
      options as SetRequired<
        OAuth2ClientOptions,
        'clientId' | 'clientSecret' | 'connections'
      >,
      env,
    );
  }

  private readonly clients = new Map<string, ApiClient>();

  authorizationURLHook(_: string, url: URL) {
    url.searchParams.set('force_install_if_needed', 'true');
    return url;
  }

  async getClient(connection: string): Promise<ApiClient> {
    let client = this.clients.get(connection);

    if (client) {
      return client;
    }

    const { access } = await this.getToken(connection);

    client = new ApiClient({ token: access });

    this.clients.set(connection, client);

    return client;
  }

  async getUserInfo(connection: string): Promise<GetMeOpQuery['me']> {
    const client = await this.getClient(connection);

    return client.operations.getMeOp().then((r) => r.me);
  }
}

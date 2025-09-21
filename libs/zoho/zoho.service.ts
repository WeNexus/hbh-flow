import type { OAuth2ClientOptions, RequestConfig } from '../hub/types';
import { Client, OAUTH2_CLIENT_OPTIONS } from '../hub/misc';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { ModuleRef, Reflector } from '@nestjs/core';
import { OAuth2HttpClient } from '../hub/clients';
import { ZohoUserInfo } from '#lib/zoho/types';
import { EnvService } from '#lib/core/env';
import { Inject } from '@nestjs/common';
import { merge } from 'lodash-es';

@Client('oauth2', {
  id: 'zoho',
  name: 'Zoho',
  icon: 'https://www.zohowebstatic.com/sites/zweb/images/commonroot/zoho-logo-web.svg',
  scopes: [
    'aaaserver.profile.READ',
    'ZohoCRM.modules.ALL',
    'ZohoCRM.settings.ALL',
    'ZohoCRM.users.ALL',
    'ZohoCRM.org.ALL',
    'ZohoCRM.bulk.ALL',
    'ZohoCRM.coql.READ',
    'ZohoInventory.fullaccess.ALL',
    'ZohoBooks.fullaccess.ALL',
    'Desk.tickets.ALL',
    'Desk.contacts.ALL',
    'Desk.tasks.ALL',
    'Desk.basic.ALL',
    'Desk.settings.ALL',
    'Desk.search.READ',
    'Desk.events.ALL',
    'Desk.articles.ALL',
    'ZohoCliq.Channels.ALL',
    'ZohoCliq.Chats.ALL',
    'ZohoCliq.Buddies.ALL',
    'ZohoCliq.Bots.ALL',
    'ZohoCliq.Users.ALL',
    'ZohoCliq.Profile.ALL',
    'ZohoCliq.Departments.ALL',
    'ZohoCliq.Teams.ALL',
    'ZohoCliq.Messages.ALL',
    'ZohoCliq.StorageData.ALL',
    'ZohoCliq.Applications.ALL',
    'ZohoAnalytics.fullaccess.ALL',
    'ZohoCreator.bulk.CREATE',
    'ZohoCreator.bulk.READ',
    'ZohoCreator.dashboard.READ',
    'ZohoCreator.form.CREATE',
    'ZohoCreator.meta.application.READ',
    'ZohoCreator.meta.form.READ',
    'ZohoCreator.report.CREATE',
    'ZohoCreator.report.DELETE',
    'ZohoCreator.report.READ',
    'ZohoCreator.report.UPDATE',
    'ZohoSheet.dataAPI.READ',
    'ZohoSheet.dataAPI.UPDATE',
  ],
  connections: [
    {
      id: 'hbh',
      description: 'Honehbeeherb Zoho Connection',
      authorizationURL: 'https://accounts.zoho.com/oauth/v2/auth',
      tokenURL: 'https://accounts.zoho.com/oauth/v2/token',
    },
    {
      id: 'miami_distro',
      description: 'Miami Distro Zoho Connection',
      authorizationURL: 'https://accounts.zoho.com/oauth/v2/auth',
      tokenURL: 'https://accounts.zoho.com/oauth/v2/token',
    },
  ],
})
export class ZohoService extends OAuth2HttpClient {
  constructor(
    moduleRef: ModuleRef,
    reflector: Reflector,
    @Inject(OAUTH2_CLIENT_OPTIONS) options: OAuth2ClientOptions,
    env: EnvService,
  ) {
    super(
      moduleRef,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      merge(
        {},
        reflector.get<OAuth2ClientOptions>('HBH_HUB_CLIENT', ZohoService),
        options,
      ) as any,
      env,
    );
  }

  async getUserInfo(connection: string): Promise<ZohoUserInfo | null> {
    try {
      const { data: data1 } = await this.get<Record<string, any>>(
        '/oauth/user/info',
        {
          baseURL: 'https://accounts.zoho.com',
          connection,
        },
      );

      const { data: data2 } = await this.get<Record<string, any>>(
        '/oauth/v2/userinfo',
        {
          baseURL: 'https://accounts.zoho.com',
          connection,
        },
      );

      return {
        id: Number(data1.ZUID),
        email: data1.Email as string,
        firstName: data1.First_Name as string,
        lastName: (data1.Last_Name || null) as string | null,
        displayName: data1.Display_Name as string,
        pictureUrl: (data2.picture || null) as string | null,
      };
    } catch (e: unknown) {
      if (e instanceof AxiosError) {
        return null;
      }

      throw e;
    }
  }

  protected defaultConfig(
    connection: string,
  ): Promise<AxiosRequestConfig> | AxiosRequestConfig {
    this.validateConnection(connection);

    return {
      baseURL: 'https://www.zohoapis.com',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 1000 * 60 * 15, // 15 minutes
      validateStatus: (status) => status >= 200 && status < 300, // Accept only 2xx responses
    };
  }

  protected async intercept(config: RequestConfig) {
    if (config.noAuth) {
      return config;
    }

    const token = await this.getToken(config.connection);

    const headers = config.headers || {};
    headers.Authorization = `Zoho-oauthtoken ${token.access}`;
    config.headers = headers;

    return config;
  }
}

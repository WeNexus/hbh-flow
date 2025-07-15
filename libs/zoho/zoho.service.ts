import { Client, OAUTH2_CLIENT_OPTIONS } from '#lib/oauth2/misc';
import type { OAuth2ClientOptions } from '#lib/oauth2/types';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { OAuth2HttpClient } from '#lib/oauth2/clients';
import { ZohoUserInfo } from '#lib/zoho/types';
import { ModuleRef, Reflector } from '@nestjs/core';
import { OAuth2Token } from '@prisma/client';
import { EnvService } from '#lib/core/env';
import { Inject } from '@nestjs/common';
import _ from 'lodash';

@Client({
  id: 'zoho',
  name: 'Zoho',
  icon: 'https://www.zohowebstatic.com/sites/zweb/images/commonroot/zoho-logo-web.svg',
  scopes: ['aaaserver.profile.READ'],
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
      _.merge(
        {},
        reflector.get<OAuth2ClientOptions>('HBH_OAUTH2_CLIENT', ZohoService),
        options,
      ) as any,
      env,
    );
  }

  async getUserInfo(connection: string): Promise<ZohoUserInfo | null> {
    try {
      const res1 = await this.get<string>('/oauth/user/info', {
        baseURL: 'https://accounts.zoho.com',
        connection,
      });

      const res2 = await this.get<string>('/oauth/v2/userinfo', {
        baseURL: 'https://accounts.zoho.com',
        connection,
      });

      const data1 = JSON.parse(res1.data) as Record<string, any>;
      const data2 = JSON.parse(res2.data) as Record<string, any>;

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

  protected defaultConfig(): Promise<AxiosRequestConfig> | AxiosRequestConfig {
    return {
      baseURL: 'https://www.zohoapis.com',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 10000, // 10 seconds
      validateStatus: (status) => status >= 200 && status < 300, // Accept only 2xx responses
    };
  }

  protected intercept(config: AxiosRequestConfig, token?: OAuth2Token) {
    if (!token) {
      return config;
    }

    const headers = config.headers || {};
    headers.Authorization = `Zoho-oauthtoken ${token.access}`;
    config.headers = headers;

    return config;
  }
}

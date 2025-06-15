import { Injectable } from '@nestjs/common';
import process from 'node:process';

@Injectable()
export class EnvService {
  readonly environment = process.env.NODE_ENV as
    | 'development'
    | 'production'
    | 'test';

  constructor() {}

  get isProd(): boolean {
    return this.environment === 'production';
  }

  getString<T = string, D = T | null, R = T | D>(key: string, _default?: D): R {
    const value = process.env[key];

    if (!value) {
      return (_default || null) as unknown as R;
    }

    return value as R;
  }

  getNumber<T = number, D = T | null, R = T | D>(key: string, _default?: D): R {
    const value: string | undefined = process.env[key];

    if (!value) {
      return (_default || null) as unknown as R;
    }

    return Number(value) as R;
  }

  getObject<T = Record<string, any>, D = T | null, R = T | D>(
    key: string,
    _default?: D,
  ): R {
    const value: string | undefined = process.env[key];

    if (!value) {
      return (_default || null) as unknown as R;
    }

    return JSON.parse(value) as R;
  }
}

import { Injectable } from '@nestjs/common';
import process from 'node:process';

/**
 * Service to access environment variables.
 * Provides methods to get string, number, and object values from environment variables.
 */

@Injectable()
export class EnvService {
  readonly environment = process.env.NODE_ENV as
    | 'development'
    | 'production'
    | 'test';

  /**
   * True if the environment is development, false otherwise.
   *
   * @type {boolean}
   */
  get isProd(): boolean {
    return this.environment === 'production';
  }

  /**
   * Gets the value of an environment variable as a string.
   * @param key - The name of the environment variable.
   * @param _default - The default value to return if the environment variable is not set.
   * @returns The value of the environment variable as a string, or the default value if not set.
   */
  getString<T = string, D = T | null, R = T | D>(key: string, _default?: D): R {
    const value = process.env[key];

    if (!value) {
      return (_default || null) as unknown as R;
    }

    return value as R;
  }

  /**
   * Gets the value of an environment variable as a number.
   * @param key - The name of the environment variable.
   * @param _default - The default value to return if the environment variable is not set.
   * @returns The value of the environment variable as a number, or the default value if not set.
   */
  getNumber<T = number, D = T | null, R = T | D>(key: string, _default?: D): R {
    const value: string | undefined = process.env[key];

    if (!value) {
      return (_default || null) as unknown as R;
    }

    return Number(value) as R;
  }

  /**
   * Gets the value of an environment variable as an object.
   * @param key - The name of the environment variable.
   * @param _default - The default value to return if the environment variable is not set.
   * @returns The value of the environment variable as an object, or the default value if not set.
   */
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

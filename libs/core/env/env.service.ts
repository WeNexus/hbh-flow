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
   * Checks if the current environment is development.
   * @return {boolean} True if the environment is development, false otherwise.
   */
  get isProd(): boolean {
    return this.environment === 'production';
  }

  /**
   * Gets the value of an environment variable as a string.
   * @param {string} key - The name of the environment variable.
   * @param {D} [_default] - The default value to return if the environment variable is not set.
   * @return {R} The value of the environment variable as a string, or the default value if not set.
   *
   * @template D - The type of the default value.
   * @template R - The return type, which can be the type of the environment variable or the default value.
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
   * @param {string} key - The name of the environment variable.
   * @param {D} [_default] - The default value to return if the environment variable is not set.
   * @return {R} The value of the environment variable as a number, or the default value if not set.
   *
   * @template T - The type of the environment variable, defaulting to number.
   * @template D - The type of the default value, which can be the type of the environment variable or null.
   * @template R - The return type, which can be the type of the environment variable or the default value.
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
   * @param {string} key - The name of the environment variable.
   * @param {D} [_default] - The default value to return if the environment variable is not set.
   * @return {R} The value of the environment variable as an object, or the default value if not set.
   *
   * @template T - The type of the object, defaulting to Record<string, any>.
   * @template D - The type of the default value, which can be the type of the object or null.
   * @template R - The return type, which can be the type of the object or the default value.
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

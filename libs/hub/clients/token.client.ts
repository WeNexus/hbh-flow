import { NoConnectionException } from '../exceptions';
import { TokenClientOptions } from '../types';
import { SetRequired } from 'type-fest';

type Options = SetRequired<TokenClientOptions, 'connections'>;

export abstract class TokenClient {
  constructor(public readonly clientOptions: Options) {
    for (const connection of clientOptions.connections) {
      if (!this.tokens.has(connection.id)) {
        this.tokens.set(connection.id, connection.tokens);
      }
    }
  }

  protected tokens = new Map<string, Record<string, string>>();

  /**
   * Test the connection for a specific connection identifier.
   * This method should be implemented by subclasses to perform the actual connection test.
   *
   * @param connection - The connection identifier to test.
   * @return A promise that resolves to a boolean indicating whether the connection is valid.
   */
  abstract testConnection(connection: string): Promise<boolean> | boolean;

  /**
   * Retrieve tokens for a specific connection.
   *
   * @param connection - The connection identifier.
   * @returns The tokens for the specified connection.
   */
  getToken(connection: string): Record<string, string> {
    const token = this.tokens.get(connection);

    if (!token) {
      throw new NoConnectionException(
        `No token found for connection "${connection}". Please connect first.`,
      );
    }

    return token;
  }
}

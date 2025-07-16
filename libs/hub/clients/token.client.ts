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

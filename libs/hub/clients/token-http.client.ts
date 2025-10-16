import { applyMixins } from 'rxjs/internal/util/applyMixins';
import { TokenClient } from './token.client';
import { HttpClient } from './http.client';
import { AxiosInstance } from 'axios';

/**
 * Base class for Token HTTP clients.
 * This class should be extended by specific Token HTTP clients.
 */
export abstract class TokenHttpClient extends TokenClient {
  protected readonly fetchers = new Map<string, AxiosInstance>();
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TokenHttpClient extends HttpClient {}

applyMixins(TokenHttpClient, [HttpClient]);

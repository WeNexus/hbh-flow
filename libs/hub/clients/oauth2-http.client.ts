import { applyMixins } from 'rxjs/internal/util/applyMixins';
import { OAuth2Client } from './oauth2.client';
import { HttpClient } from './http.client';
import { AxiosInstance } from 'axios';

/**
 * Base class for OAuth2 HTTP clients.
 * This class should be extended by specific OAuth2 HTTP clients.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export abstract class OAuth2HttpClient extends OAuth2Client {
  protected readonly fetchers = new Map<string, AxiosInstance>();
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type,@typescript-eslint/no-unsafe-declaration-merging
export interface OAuth2HttpClient extends HttpClient {}

applyMixins(OAuth2HttpClient, [HttpClient]);

import { TokenClientConnection } from './token-client-connection';

export interface TokenClientOptions {
  id: string; // Unique identifier for the OAuth2 provider
  name: string; // Display name of the OAuth2 provider
  icon?: string; // URL to the icon representing the OAuth2 provider
  connections?: TokenClientConnection[];
}

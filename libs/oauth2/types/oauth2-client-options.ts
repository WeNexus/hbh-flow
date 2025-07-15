import { OAuth2Connection } from './oauth2-connection';

export interface OAuth2ClientOptions {
  id: string; // Unique identifier for the OAuth2 provider
  name: string; // Display name of the OAuth2 provider
  icon?: string; // URL to the icon representing the OAuth2 provider
  scopes: string[]; // Scopes requested by the OAuth2 client
  clientId?: string;
  clientSecret?: string;
  connections?: OAuth2Connection[];
}

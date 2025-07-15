export interface OAuth2Connection {
  id: string; // Unique identifier for the OAuth2 connection
  description?: string; // Description of the connection
  authorizationURL: string;
  tokenURL: string;
  scopes?: string[];
}

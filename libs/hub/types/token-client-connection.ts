export interface TokenClientConnection {
  id: string; // Unique identifier for the OAuth2 connection
  description?: string; // Description of the connection
  tokens: Record<string, string>; // Key-value pairs for tokens, e.g., access token, csrf token, etc.
}

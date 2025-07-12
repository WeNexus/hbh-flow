export interface LoginResult {
  accessToken: string; // The JWT access token for the user
  csrfToken: string; // The CSRF token for the session
  expiresIn: string; // The expiration time of the access token in ISO format
}

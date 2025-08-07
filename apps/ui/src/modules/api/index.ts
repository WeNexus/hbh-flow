import type { LoginOutputSchema, UserSchema } from '@/types/schema.ts';
import { Manager } from 'socket.io-client';
import { Axios } from 'axios';

import {
  UserUpdatedEvent,
  LogoutEvent,
  LoginEvent,
} from '@/modules/api/events.ts';

/**
 * Singleton class for managing API requests with session persistence, CSRF token handling,
 * and automatic session refresh.
 *
 * This class extends Axios and provides authentication methods and session management features.
 * All requests are scoped under the `/api` base path.
 *
 * @remarks
 * - Dispatches custom `LoginEvent`, `UserUpdatedEvent`, and native `LogOutEvent()`.
 * - Automatically refreshes login if session expiry is within the next hour.
 */
export class Api extends Axios {
  constructor() {
    if (Api.instance) {
      return Api.instance;
    }

    super({
      baseURL: location.origin + '/api',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
    });

    this.initialize();

    this.interceptors.request.use((config) => {
      // Attach CSRF token to headers if available.
      if (this.csrfToken) {
        config.headers['X-CSRF-Token'] = this.csrfToken;
      }
      return config;
    });

    this.interceptors.response.use((response) => {
      if (response.status === 401) {
        // If the response status is 401, it means the session has expired or is invalid.
        void this.logout(true);
      }

      return response;
    });

    Api.instance = this;
  }

  private static instance: Api | null = null;

  /**
   * Event dispatcher used to subscribe to login/logout/session events.
   *
   * @example
   * ```ts
   * api.events.addEventListener('logout', () => {
   *   // handle logout UI change
   * });
   *
   * api.events.addEventListener('login', (e: LoginEvent) => {
   *   console.log('User logged in:', e.detail);
   * });
   * ```
   */
  public events = new EventTarget();
  private sessionExpiresAt: Date | null = null;
  private csrfToken: string | null = null;
  private _user: UserSchema | null = null;

  // --------- Public API ---------

  /**
   * Socket.IO manager instance for real-time communication.
   * Automatically connects to the server at the specified origin.
   *
   * @remarks
   * - Uses the same origin as the API base URL.
   * - Configured for reconnection and with credentials.
   */
  public io = new Manager(location.origin, {
    path: '/api/socket.io',
    autoConnect: false,
    reconnection: true,
    reconnectionDelayMax: 10000,
    withCredentials: true,
    reconnectionDelay: 2000,
  });

  /**
   * Returns the currently authenticated user object.
   * Returns `null` if no session is active or the session is invalid.
   */
  get user() {
    return this._user;
  }

  /**
   * Authenticates the user with the given credentials.
   *
   * @param email - The user's email address.
   * @param password - The user's password.
   * @returns A promise that resolves with the authenticated `UserSchema`.
   *
   * @throws If the credentials are invalid or the request fails.
   *
   * @remarks
   * - Stores CSRF token and session expiration in `localStorage`.
   * - Dispatches a `LoginEvent` on successful login.
   */
  async login(email: string, password: string): Promise<UserSchema> {
    const { data: result } = await this.post<LoginOutputSchema>('/auth/login', {
      email,
      password,
    });

    // Store session data in localStorage for persistence across page reloads.
    this.storeSessionData(result);

    const user = await this.loadUser();
    this.events.dispatchEvent(new LoginEvent(user));
    return user;
  }

  /**
   * Logs out the currently authenticated user.
   *
   * @param justCleanup - If `true`, only clears session data without making a logout request.
   *                      Defaults to `false`, which performs a logout request.
   * @returns A promise that resolves when logout completes.
   *
   * @remarks
   * - Clears session and CSRF token from `localStorage`.
   * - Dispatches a native `logout` event.
   */
  async logout(justCleanup = false): Promise<void> {
    if (!justCleanup) {
      await this.post('/auth/logout');
    }

    this.events.dispatchEvent(new LogoutEvent());
    this.removeSessionData();
  }

  // --------- Internal Methods ---------

  private async refreshLogin(): Promise<void> {
    const { data: result } =
      await this.post<LoginOutputSchema>('/auth/refresh');

    // Update session data in localStorage.
    this.storeSessionData(result);
  }

  private async loadUser(): Promise<UserSchema> {
    const { data: user } = await this.get<UserSchema>('/auth/whoami');
    localStorage.setItem('user', JSON.stringify(user));
    this._user = user;

    return user;
  }

  private storeSessionData(loginOutput: LoginOutputSchema): void {
    localStorage.setItem('sessionExpiresAt', loginOutput.expiresAt);
    localStorage.setItem('csrfToken', loginOutput.csrfToken);

    // Update the instance properties with the session data.
    this.sessionExpiresAt = new Date(loginOutput.expiresAt);
    this.csrfToken = loginOutput.csrfToken;
  }

  private removeSessionData(): void {
    localStorage.removeItem('csrfToken');
    localStorage.removeItem('sessionExpiresAt');
    localStorage.removeItem('user');

    this._user = null;
    this.sessionExpiresAt = null;
    this.csrfToken = null;
  }

  private initialize(): void {
    const csrfToken = localStorage.getItem('csrfToken');
    const sessionExpiresAt = localStorage.getItem('sessionExpiresAt');

    if (!csrfToken || !sessionExpiresAt) {
      // No session data available, call removeSessionData to clear any stale data.
      return this.removeSessionData();
    }

    const expiresAt = new Date(sessionExpiresAt);

    if (expiresAt < new Date()) {
      // Session has expired, remove session data.
      return this.removeSessionData();
    }

    this.sessionExpiresAt = expiresAt;
    this.csrfToken = csrfToken;
    this._user = JSON.parse(
      localStorage.getItem('user') ||
        // In case user data is not available, we return a fallback user object.
        JSON.stringify({
          id: 0,
          email: 'Loading...',
          name: 'Loading...',
          role: 'OBSERVER',
          createdAt: new Date().toISOString(),
        } as UserSchema),
    );

    this.loadUser()
      .then((user) => {
        // Notify the UI that the user has been loaded or updated.
        this.events.dispatchEvent(new UserUpdatedEvent(user));
      })
      .catch(() => this.logout(true));

    setInterval(
      () => {
        if (!this.sessionExpiresAt) {
          // If sessionExpiresAt is not set, we cannot check for expiration.
          return;
        }

        // If expiresAt is less than 60 minutes from now, refresh the session.
        const refreshThreshold = new Date(Date.now() + 1000 * 60 * 60); // 60 minutes

        if (this.sessionExpiresAt < refreshThreshold) {
          this.refreshLogin().catch(() => {
            // If refresh fails, log out the user.
            void this.logout(true);
          });
        }
      },
      1000 * 60 * 5,
    ); // Check every 5 minutes to refresh the session if needed.
  }
}

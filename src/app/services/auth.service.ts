import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, defer, finalize, map, of, shareReplay, switchMap, tap, throwError, timer } from 'rxjs';
import { environment } from '../../environments/environment';
import type { ProfileLinksData } from './profile-link.service';

const LOGIN_ROUTE_PATH = '/api/auth/login';
const REGISTER_ROUTE_PATH = '/api/auth/register';
const LOGIN_SESSION_VERIFICATION_DELAY_MS = 100;

/**
 * Minimal shape used by the SPA to represent the authenticated user.
 * It intentionally maps backend fields without storing credentials client-side.
 */
export interface AuthUser {
  id: number;
  name?: string;
  username?: string;
  // Copiamos aquí el perfil visible para mantener el estado en memoria.
  headline?: string | null;
  bio?: string | null;
  skills?: string[] | null;
  links?: ProfileLinksData;
  avatar?: string | null;
  email?: string;
  role?: string;
}

/**
 * Payload expected by the public registration endpoint.
 */
export interface RegisterData {
  nombre: string;
  apellidos: string;
  usuario: string;
  email: string;
  password: string;
  password_confirmation: string;
}

/**
 * Payload expected by the authenticated change-password endpoint.
 */
export interface ChangePasswordData {
  current_password: string;
  password: string;
  password_confirmation: string;
}

export type AuthHydrationState = 'idle' | 'hydrating' | 'hydrated';

@Injectable({ providedIn: 'root' })
/**
 * Coordinates browser-side authentication against the Laravel backend.
 *
 * Key responsibilities:
 * - obtain the CSRF cookie required by Sanctum before mutating auth requests.
 * - maintain the in-memory authenticated user used by guards and components.
 * - normalize backend response shapes for login, register and session restore.
 *
 * Security note:
 * - session state stays server-side in cookies; this service never persists
 *   credentials or tokens in localStorage/sessionStorage.
 */
export class AuthService {
  private readonly userSubject = new BehaviorSubject<AuthUser | null>(null);
  private readonly hydrationStateSubject = new BehaviorSubject<AuthHydrationState>('idle');
  private readonly authLoadingSubject = new BehaviorSubject<boolean>(false);
  private sessionHydration$: Observable<AuthUser | null> | null = null;
  private meInFlight$: Observable<AuthUser> | null = null;
  private loginInFlight$: Observable<AuthUser> | null = null;
  private authFlowVersion = 0;
  readonly user$ = this.userSubject.asObservable();
  readonly hydrationState$ = this.hydrationStateSubject.asObservable();
  readonly loading$ = this.authLoadingSubject.asObservable();

  constructor(private readonly http: HttpClient) {}

  /**
   * Every state-changing auth request starts by obtaining a fresh Sanctum CSRF
   * cookie pair. The interceptor then forwards credentials automatically.
   */
  csrf(): Observable<unknown> {
    const url = this.buildApiUrl('/sanctum/csrf-cookie');
    this.logDebug('csrf:start', { url });

    return this.http.get(url, {
      withCredentials: true,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
      params: {
        _ts: Date.now(),
      },
    }).pipe(
      tap(() => this.logDebug('csrf:success', { url })),
      catchError((error) => {
        this.logHttpError('csrf:error', error, { url });
        return throwError(() => error);
      }),
    );
  }

  /**
   * Logs in against the Laravel session guard and hydrates in-memory user
   * state from the response, falling back to /auth/me if necessary.
   */
  login(identifier: string, password: string, remember = false): Observable<AuthUser> {
    if (this.loginInFlight$) {
      return this.loginInFlight$;
    }

    this.authLoadingSubject.next(true);
    const loginVersion = ++this.authFlowVersion;
    const normalizedIdentifier = identifier.trim();
    const url = this.buildApiUrl(LOGIN_ROUTE_PATH);
    this.logDebug('login:submit:start', {
      identifier: normalizedIdentifier,
      csrfUrl: this.buildApiUrl('/sanctum/csrf-cookie'),
      postUrl: url,
    });

    this.loginInFlight$ = this.csrf().pipe(
      switchMap(() => {
        this.logDebug('login:post:start', { url });
        return this.http.post<unknown>(url, { identifier: normalizedIdentifier, password, remember }, {
          withCredentials: true,
        }).pipe(
          tap(() => this.logDebug('login:post:success', { url })),
          catchError((error) => {
            this.logHttpError('login:post:error', error, { url });
            return throwError(() => error);
          }),
        );
      }),
      switchMap((res) => {
        const loginUser = this.extractUserFromAuthResponse(res);
        return this.verifyLoginSession(loginUser);
      }),
      tap((user) => {
        this.publishUserIfCurrent(user, loginVersion);
        this.markHydrated();
      }),
      catchError((error) => {
        this.clearUserIfCurrent(loginVersion);
        this.markHydrated();
        return throwError(() => error);
      }),
      finalize(() => {
        this.loginInFlight$ = null;
        this.authLoadingSubject.next(false);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.loginInFlight$;
  }

  private verifyLoginSession(loginUser: AuthUser | null): Observable<AuthUser> {
    return timer(LOGIN_SESSION_VERIFICATION_DELAY_MS).pipe(
      switchMap(() => this.fetchVerifiedLoginUser(loginUser)),
      catchError((error) => {
        if (!this.isUnauthorizedHttpError(error)) {
          return throwError(() => error);
        }

        return timer(LOGIN_SESSION_VERIFICATION_DELAY_MS).pipe(
          switchMap(() => this.fetchVerifiedLoginUser(loginUser)),
        );
      }),
    );
  }

  /**
   * Public registration also uses Sanctum CSRF so browser and API stay on the
   * same stateful contract as login/logout/change-password.
   */
  register(payload: RegisterData): Observable<AuthUser> {
    const url = this.buildApiUrl(REGISTER_ROUTE_PATH);
    this.logDebug('register:submit:start', {
      username: payload.usuario,
      email: payload.email,
      csrfUrl: this.buildApiUrl('/sanctum/csrf-cookie'),
      postUrl: url,
    });

    return this.csrf().pipe(
      switchMap(() => {
        this.logDebug('register:post:start', { url });
        return this.http.post<unknown>(url, payload, {
          withCredentials: true,
        }).pipe(
          tap(() => this.logDebug('register:post:success', { url })),
          catchError((error) => {
            this.logHttpError('register:post:error', error, { url });
            return throwError(() => error);
          }),
        );
      }),
      map((res) => {
        const user = this.extractUserFromAuthResponse(res);
        if (!user) {
          throw new Error('No se pudo extraer el usuario creado desde la respuesta del backend.');
        }

        return user;
      }),
    );
  }

  /**
   * Rehydrates the current session from the backend and updates the SPA store.
   */
  me(): Observable<AuthUser> {
    if (this.meInFlight$) {
      return this.meInFlight$;
    }

    const requestVersion = this.authFlowVersion;

    this.meInFlight$ = this.fetchCurrentUser().pipe(
      tap((user) => this.publishUserIfCurrent(user, requestVersion)),
      catchError((error) => {
        this.clearUserIfCurrent(requestVersion);
        return throwError(() => error);
      }),
      finalize(() => {
        this.meInFlight$ = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.meInFlight$;
  }

  hydrateSession(): Observable<AuthUser | null> {
    if (this.loginInFlight$) {
      return this.loginInFlight$.pipe(catchError(() => of(null)));
    }

    if (this.isHydrated() && !this.sessionHydration$) {
      return of(this.userSubject.value);
    }

    if (this.userSubject.value) {
      this.markHydrated();
      return of(this.userSubject.value);
    }

    if (!this.sessionHydration$) {
      const hydrationVersion = this.authFlowVersion;
      this.hydrationStateSubject.next('hydrating');
      this.authLoadingSubject.next(true);

      this.sessionHydration$ = this.fetchCurrentUser().pipe(
        tap((user) => this.publishUserIfCurrent(user, hydrationVersion)),
        catchError(() => of(null)),
        finalize(() => {
          this.sessionHydration$ = null;
          this.markHydrated();
          this.authLoadingSubject.next(false);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }

    return this.sessionHydration$;
  }

  waitForHydration(): Observable<AuthUser | null> {
    return this.isHydrated() ? of(this.userSubject.value) : this.hydrateSession();
  }

  requireAuthenticatedUser(): Observable<AuthUser> {
    return this.waitForHydration().pipe(
      switchMap((user) => {
        if (user) {
          return of(user);
        }

        return throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthenticated' }));
      }),
    );
  }

  runWhenAuthenticated<T>(requestFactory: () => Observable<T>): Observable<T> {
    return this.requireAuthenticatedUser().pipe(
      switchMap(() => requestFactory()),
    );
  }

  /**
   * Client state is cleared on both success and failure so protected routes do
   * not keep stale auth data after a logout attempt.
   */
  logout(): Observable<unknown> {
    return this.http.post(`${environment.apiUrl}/api/auth/logout`, {}, {
      withCredentials: true,
    }).pipe(
      finalize(() => this.userSubject.next(null)),
      tap(() => this.userSubject.next(null)),
    );
  }

  deleteMe(): Observable<unknown> {
    return defer(() => {
      return this.http.delete(`${environment.apiUrl}/api/auth/me`, {
        withCredentials: true,
      });
    });
  }

  /**
   * Password rotation is another state-changing request, so it also refreshes
   * the CSRF cookie before posting to the protected endpoint.
   */
  changePassword(payload: ChangePasswordData): Observable<unknown> {
    return this.csrf().pipe(
      switchMap(() =>
        this.http.post(`${environment.apiUrl}/api/auth/change-password`, payload, {
          withCredentials: true,
        }),
      ),
    );
  }

  forgotUsername(email: string): Observable<unknown> {
    return this.csrf().pipe(
      switchMap(() =>
        this.http.post(this.buildApiUrl('/api/auth/forgot-username'), { email }, { withCredentials: true }),
      ),
    );
  }

  forgotPassword(email: string): Observable<unknown> {
    return this.csrf().pipe(
      switchMap(() =>
        this.http.post(this.buildApiUrl('/api/auth/forgot-password'), { email }, { withCredentials: true }),
      ),
    );
  }

  resetPassword(payload: { token: string; email: string; password: string; password_confirmation: string }): Observable<unknown> {
    return this.csrf().pipe(
      switchMap(() =>
        this.http.post(this.buildApiUrl('/api/auth/reset-password'), payload, { withCredentials: true }),
      ),
    );
  }

  getCurrentUser(): AuthUser | null {
    return this.userSubject.value;
  }

  patchCurrentUser(partial: Partial<AuthUser>): void {
    // Sincroniza el usuario actual sin volver a pedir la sesión al backend.
    const current = this.userSubject.value;
    if (current) {
      this.userSubject.next({ ...current, ...partial });
    }
  }

  /**
   * Exposes whether the in-memory auth store currently contains a user.
   */
  isAuthenticated(): boolean {
    return !!this.userSubject.value;
  }

  isHydrated(): boolean {
    return this.hydrationStateSubject.value === 'hydrated';
  }

  /**
   * Normalizes arbitrary backend payloads into the minimal AuthUser shape.
   *
   * @param res Raw HTTP response payload from Laravel.
   * @returns Authenticated user model for SPA state.
   */
  private extractUser(res: unknown): AuthUser {
    const candidate = this.extractUserFromAuthResponse(res);
    if (candidate) {
      return candidate;
    }

    throw new Error('No se pudo extraer el usuario de la respuesta del backend.');
  }

  private fetchCurrentUser(): Observable<AuthUser> {
    return this.http.get<unknown>(`${environment.apiUrl}/api/auth/me`, {
      withCredentials: true,
    }).pipe(
      map((res) => this.extractUser(res)),
    );
  }

  private fetchVerifiedLoginUser(loginUser: AuthUser | null): Observable<AuthUser> {
    return this.http.get<unknown>(`${environment.apiUrl}/api/auth/me`, {
      withCredentials: true,
    }).pipe(
      map((res) => {
        const sessionUser = this.extractUserFromAuthResponse(res);
        if (sessionUser) {
          return sessionUser;
        }

        // A 200 /me proves the rotated session cookie is usable; keep the
        // login payload as the user source if that response body is sparse.
        if (loginUser) {
          return loginUser;
        }

        throw new Error('No se pudo extraer el usuario de la sesion verificada.');
      }),
    );
  }

  private isUnauthorizedHttpError(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 401;
  }

  private publishUserIfCurrent(user: AuthUser, version: number): void {
    if (version === this.authFlowVersion) {
      this.userSubject.next(user);
    }
  }

  private clearUserIfCurrent(version: number): void {
    if (version === this.authFlowVersion) {
      this.userSubject.next(null);
    }
  }

  private markHydrated(): void {
    if (this.hydrationStateSubject.value !== 'hydrated') {
      this.hydrationStateSubject.next('hydrated');
    }
  }

  /**
   * The backend is not fully uniform yet: register returns data.user, while
   * login/me may return data directly. This adapter keeps the SPA isolated
   * from those response-shape differences.
   */
  private extractUserFromAuthResponse(res: unknown): AuthUser | null {
    // El backend no siempre responde con la misma forma, así que normalizamos aquí.
    if (!res || typeof res !== 'object') {
      return null;
    }

    const candidateData = (res as { data?: unknown })?.data;
    if (candidateData && this.isAuthUser(candidateData)) {
      return candidateData;
    }

    const dataAsWrapper = candidateData as { user?: unknown } | null;
    if (dataAsWrapper && 'user' in dataAsWrapper) {
      const candidateNestedUser = dataAsWrapper.user;
      if (candidateNestedUser && this.isAuthUser(candidateNestedUser)) {
        return candidateNestedUser;
      }
    }

    const candidateUser = (res as { user?: unknown })?.user;
    if (candidateUser && this.isAuthUser(candidateUser)) {
      return candidateUser;
    }

    if (this.isAuthUser(res)) {
      return res as AuthUser;
    }

    return null;
  }

  private isAuthUser(value: unknown): value is AuthUser {
    return Boolean(
      value &&
      typeof value === 'object' &&
      'id' in (value as Record<string, unknown>),
    );
  }

  /**
   * Prefixes relative backend paths with the configured API origin.
   *
   * @param path Backend path expected by Laravel.
   * @returns Fully qualified API URL.
   */
  private buildApiUrl(path: string): string {
    return `${environment.apiUrl}${path}`;
  }

  /**
   * Emits Cypress-only debug information for E2E diagnosis.
   *
   * @param message Short event identifier for the auth flow.
   * @param details Structured data useful during Cypress runs.
   */
  private logDebug(message: string, details: Record<string, unknown>): void {
    if (typeof window === 'undefined' || !('Cypress' in window)) {
      return;
    }

    console.info(`[AuthService] ${message}`, details);
  }

  /**
   * Emits Cypress-only HTTP error details without affecting production logic.
   *
   * @param message Short event identifier for the failing step.
   * @param error Original error object emitted by HttpClient.
   * @param details Extra request context for debugging.
   */
  private logHttpError(message: string, error: unknown, details: Record<string, unknown>): void {
    if (typeof window === 'undefined' || !('Cypress' in window)) {
      return;
    }

    const status = typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;

    console.error(`[AuthService] ${message}`, {
      ...details,
      status,
      error,
    });
  }
}

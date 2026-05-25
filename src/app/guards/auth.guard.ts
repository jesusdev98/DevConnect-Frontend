import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AUTH_ROUTES } from '../auth/auth-routes';
import { AuthService } from '../services/auth.service';

/**
 * Route guard for private SPA areas.
 *
 * Strategy:
 * - If there is already an in-memory user, allow navigation.
 * - Otherwise call /api/auth/me to restore session from Sanctum cookies.
 * - If restoration fails, redirect to the canonical login route.
 *
 * Security note:
 * - authorization is still enforced by the backend; the guard only protects
 *   navigation flow inside the SPA and avoids exposing private screens.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  /**
   * Validates access to protected routes using session-based auth state.
   *
   * @returns Observable that resolves to true or a redirect UrlTree.
   */
  canActivate(): Observable<boolean | UrlTree> {
    if (this.authService.isHydrated() && this.authService.isAuthenticated()) {
      return of(true);
    }

    return this.authService.waitForHydration().pipe(
      map((user) => user ? true : this.router.parseUrl(AUTH_ROUTES.login)),
      catchError(() => of(this.router.parseUrl(AUTH_ROUTES.login))),
    );
  }
}

import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Ensures every request targeting Laravel API includes browser credentials.
 *
 * Why this matters for Sanctum SPA:
 * - Session authentication is cookie-based (HttpOnly session cookie).
 * - CSRF validation expects X-XSRF-TOKEN in state-changing requests.
 * - Cross-origin calls (4200 -> 8001) require withCredentials=true.
 *
 * Security note:
 * - the interceptor only touches requests aimed at the configured backend
 *   origin, so third-party requests are not modified inadvertently.
 */
@Injectable()
export class CredentialsInterceptor implements HttpInterceptor {
  /**
   * Adds withCredentials for backend calls and injects X-XSRF-TOKEN header
   * for mutating HTTP verbs when the cookie exists.
   *
   * @param req Outgoing HttpClient request.
   * @param next Next interceptor handler in the Angular pipeline.
   * @returns Observable for the eventual HTTP event stream.
   */
  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!this.targetsBackend(req.url)) {
      return next.handle(req);
    }

    const xsrfToken = this.getCookie('XSRF-TOKEN');
    const shouldAttachXsrf =
      xsrfToken !== null &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase()) &&
      !req.headers.has('X-XSRF-TOKEN');

    const credentialsReq = req.clone({
      withCredentials: true,
      setHeaders: shouldAttachXsrf
        ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrfToken) }
        : {},
    });

    return next.handle(credentialsReq);
  }

  /**
   * Matches only the configured backend origin/path or explicit same-origin
   * Laravel paths. String-prefix matching is intentionally avoided so
   * similarly named third-party hosts cannot receive credentials.
   */
  private targetsBackend(requestUrl: string): boolean {
    if (requestUrl.startsWith('/api/') || requestUrl.startsWith('/sanctum/')) {
      return true;
    }

    if (!environment.apiUrl || typeof window === 'undefined') {
      return false;
    }

    try {
      const request = new URL(requestUrl, window.location.origin);
      const api = new URL(environment.apiUrl, window.location.origin);
      const apiPath = api.pathname === '/' ? '/' : api.pathname.replace(/\/$/, '');
      const targetsApiPath = apiPath === '/'
        || request.pathname === apiPath
        || request.pathname.startsWith(`${apiPath}/`);

      return request.origin === api.origin && targetsApiPath;
    } catch {
      return false;
    }
  }

  /**
   * Reads a cookie value from document.cookie in the browser context.
   *
   * @param name Cookie name to look up.
   * @returns Cookie value or null when absent.
   */
  private getCookie(name: string): string | null {
    if (typeof document === 'undefined' || !document.cookie) {
      return null;
    }

    const target = `${name}=`;
    const parts = document.cookie.split(';');
    for (const rawPart of parts) {
      const part = rawPart.trim();
      if (part.startsWith(target)) {
        return part.slice(target.length);
      }
    }

    return null;
  }
}

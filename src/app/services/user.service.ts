import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import type { ProfileLinksData } from './profile-link.service';

export interface PublicUser {
  id: number;
  name: string | null;
  username: string | null;
  role?: string;
  followersCount?: number;
  followedByCurrentUser?: boolean;
}

export interface PublicProfile {
  id: number;
  name: string | null;
  username: string | null;
  // Datos editables que forman el perfil visible del usuario.
  headline: string | null;
  bio: string | null;
  skills: string[];
  links: ProfileLinksData;
  avatar: string | null;
  postsCount: number;
  commentsCount: number;
  followersCount: number;
  followedByCurrentUser: boolean;
}

export interface UpdateProfilePayload {
  // Payload compacto para guardar área de especialidad, skills y enlaces.
  headline?: string | null;
  skills?: string[];
  links?: ProfileLinksData;
}

export interface UserLevel {
  points: number;
  level: number;
  nextLevelPoints: number | null;
  progressPercentage: number;
}

export interface UserAchievement {
  key: string;
  title: string;
  description: string;
  icon: string;
  requirement?: string | null;
  unlocked: boolean;
  unlockedAt: string | null;
}

@Injectable({ providedIn: 'root' })
/**
 * Fetches the public user list from the backend.
 * Result is shared and replayed so multiple consumers don't trigger
 * redundant HTTP requests within the same session.
 */
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private users$ = this.createUsersRequest$();

  private createUsersRequest$(): Observable<PublicUser[]> {
    return this.authService.runWhenAuthenticated(() =>
      this.http
        .get<{ data: PublicUser[] }>(`${environment.apiUrl}/api/users`, {
          withCredentials: true,
        })
        .pipe(map((res) => res.data)),
    ).pipe(shareReplay(1));
  }

  getUsers(forceRefresh = false): Observable<PublicUser[]> {
    if (forceRefresh) {
      this.users$ = this.createUsersRequest$();
    }

    return this.users$;
  }

  searchUsersLocal(query: string, limit = 10, forceRefresh = false): Observable<PublicUser[]> {
    const normalizedQuery = query.replace(/^@/, '').toLowerCase().trim();
    if (!normalizedQuery) {
      return of([]);
    }

    return this.getUsers(forceRefresh).pipe(
      map((users) => {
        const filtered = users.filter(
          (user) =>
            (user.username ?? '').toLowerCase().includes(normalizedQuery) ||
            (user.name ?? '').toLowerCase().includes(normalizedQuery),
        );

        return filtered.slice(0, limit);
      }),
    );
  }

  searchUsers(query: string): Observable<PublicUser[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return of([]);
    }

    return this.authService.runWhenAuthenticated(() =>
      this.http
        .get<{
          data: PublicUser[];
        }>(`${environment.apiUrl}/api/users?search=${encodeURIComponent(normalized)}`, {
          withCredentials: true,
        })
        .pipe(map((res) => res.data)),
    );
  }

  deleteUserByAdmin(userId: number): Observable<void> {
    const request$ = this.authService.runWhenAuthenticated(() => this.http
      .delete(`${environment.apiUrl}/api/admin/users/${userId}`, {
        withCredentials: true,
      })
      .pipe(
        tap(() => {
          this.invalidateUsersCache();
        }),
        map(() => undefined),
      ));

    return request$.pipe(
      catchError((error: unknown) => this.retryAfterAuthRefresh(error, request$)),
    );
  }

  invalidateUsersCache(): void {
    this.users$ = this.createUsersRequest$();
  }

  getPublicProfileByUsername(username: string): Observable<PublicProfile> {
    return this.authService.runWhenAuthenticated(() => this.http
      .get<{
        data: PublicProfile;
      }>(`${environment.apiUrl}/api/users/username/${encodeURIComponent(username.trim())}`, {
        withCredentials: true,
      })
      .pipe(map((res) => res.data)));
  }

  getUserLevel(userId: number): Observable<UserLevel> {
    return this.http.get<UserLevel>(`${environment.apiUrl}/api/users/${userId}/level`, {
      withCredentials: true,
    });
  }

  getUserAchievements(userId: number): Observable<UserAchievement[]> {
    return this.http
      .get<{
        success: boolean;
        data: UserAchievement[];
      }>(`${environment.apiUrl}/api/users/${userId}/achievements`, { withCredentials: true })
      .pipe(map((res) => res.data));
  }

  updateMyBio(bio: string | null): Observable<{ id: number; bio: string | null }> {
    return this.authService.runWhenAuthenticated(() => this.http
      .patch<{
        data: { id: number; bio: string | null };
      }>(`${environment.apiUrl}/api/auth/me/bio`, { bio }, { withCredentials: true })
      .pipe(map((res) => res.data)));
  }

  updateMyProfile(payload: UpdateProfilePayload): Observable<{
    id: number;
    headline: string | null;
    skills: string[];
    links: ProfileLinksData;
  }> {
    // Un solo endpoint para no repartir el guardado en varias peticiones.
    return this.authService.runWhenAuthenticated(() => this.http
      .patch<{
        data: { id: number; headline: string | null; skills: string[]; links: ProfileLinksData };
      }>(`${environment.apiUrl}/api/auth/me/profile`, payload, { withCredentials: true })
      .pipe(map((res) => res.data)));
  }

  updateMyAvatar(avatar: string): Observable<{ id: number; avatar: string | null }> {
    return this.authService.runWhenAuthenticated(() => this.http
      .post<{
        data: { id: number; avatar: string | null };
      }>(`${environment.apiUrl}/api/auth/me/avatar`, { avatar }, { withCredentials: true })
      .pipe(map((res) => res.data)));
  }

  private retryAfterAuthRefresh<T>(error: unknown, request$: Observable<T>): Observable<T> {
    if (!(error instanceof HttpErrorResponse)) {
      return throwError(() => error);
    }

    if (error.status === 419) {
      return this.authService.csrf().pipe(
        switchMap(() => request$),
      );
    }

    if (error.status === 401) {
      return this.authService.me().pipe(
        switchMap(() => request$),
      );
    }

    return throwError(() => error);
  }
}

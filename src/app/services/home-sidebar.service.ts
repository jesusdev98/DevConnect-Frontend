import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface HomeSidebarDev {
  id: number;
  name: string;
  username: string;
  avatar: string | null;
  postsCount: number;
}

export interface HomeSidebarTag {
  id: number;
  name: string;
  postsCount: number;
}

export interface HomeSidebarData {
  activeDevs: HomeSidebarDev[];
  trendingTags: HomeSidebarTag[];
}

@Injectable({ providedIn: 'root' })
export class HomeSidebarService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  // Petición única al backend para no repetir llamadas del sidebar.
  private readonly sidebarRequest$ = this.authService.runWhenAuthenticated(() => this.http
    .get<ApiResponse<unknown>>(
      `${environment.apiUrl}/api/home/sidebar`,
      { withCredentials: true },
    )
    .pipe(
      map((response) => this.normalizeSidebarData(response.data)),
    ));

  getSidebarData(): Observable<HomeSidebarData> {
    return this.sidebarRequest$.pipe(
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
          return throwError(() => error);
        }

        return this.authService.me().pipe(
          switchMap(() => this.sidebarRequest$),
        );
      }),
      shareReplay(1),
      );
  }

  // Limpia y adapta el payload al formato que espera la vista.
  private normalizeSidebarData(data: unknown): HomeSidebarData {
    if (!this.isRecord(data)) {
      return { activeDevs: [], trendingTags: [] };
    }

    return {
      activeDevs: this.normalizeActiveDevs(data['activeDevs']),
      trendingTags: this.normalizeTrendingTags(data['trendingTags']),
    };
  }

  // Convierte el bloque de usuarios activos en una lista segura.
  private normalizeActiveDevs(value: unknown): HomeSidebarDev[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!this.isRecord(item)) {
          return null;
        }

        const id = this.toNumber(item['id']);
        if (id === null || id <= 0) {
          return null;
        }

        return {
          id,
          name: this.toText(item['name']) || 'Usuario',
          username: this.toText(item['username']),
          avatar: typeof item['avatar'] === 'string' ? item['avatar'] : null,
          postsCount: this.toCount(item['postsCount'] ?? item['posts_count']),
        };
      })
      .filter((item): item is HomeSidebarDev => item !== null);
  }

  // Convierte las tags del backend en un listado simple para el home.
  private normalizeTrendingTags(value: unknown): HomeSidebarTag[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (!this.isRecord(item)) {
          return null;
        }

        const id = this.toNumber(item['id']);
        if (id === null || id <= 0) {
          return null;
        }

        return {
          id,
          name: this.toText(item['name']) || 'Tag',
          postsCount: this.toCount(item['postsCount'] ?? item['posts_count']),
        };
      })
      .filter((item): item is HomeSidebarTag => item !== null);
  }

  // Helpers pequeños para validar y limpiar datos sin romper la UI.
  private toText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private toNumber(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private toCount(value: unknown): number {
    const numeric = this.toNumber(value);
    return numeric !== null && numeric >= 0 ? numeric : 0;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
  }
}

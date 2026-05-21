import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface TagOption {
  id: number;
  name: string;
}

export interface TagCategory {
  id: number;
  name: string;
  tags: TagOption[];
}

@Injectable({ providedIn: 'root' })
/**
 * Servicio dedicado al catálogo de tags (categorías + tags).
 *
 * Lo usan:
 * - HomeSidebar para filtros del feed
 * - CreatePost para seleccionar tags al publicar
 */
export class TagCatalogService {
  // Caché en memoria para no repetir la misma petición en cada pantalla.
  private tagCategoriesCache: TagCategory[] | null = null;

  constructor(private readonly http: HttpClient) {}

  /**
   * Devuelve el catálogo de tags.
   * - Si ya está cacheado, responde al instante.
   * - Si no, consulta al backend y guarda el resultado en cache.
   */
  getTagCategories(): Observable<TagCategory[]> {
    if (this.tagCategoriesCache) {
      return of(this.tagCategoriesCache);
    }

    return this.http
      .get<ApiResponse<TagCategory[]>>(`${environment.apiUrl}/api/tag-categories`, {
        withCredentials: true,
      })
      .pipe(
        // Blindaje mínimo: si data no es array devolvemos [] para no romper UI.
        map((response) => (Array.isArray(response?.data) ? response.data : [])),
        tap((categories) => {
          this.tagCategoriesCache = categories;
        }),
      );
  }

  /**
   * Indica si el catálogo ya se resolvió al menos una vez en esta sesión SPA.
   */
  hasResolvedTagCatalogCache(): boolean {
    return this.tagCategoriesCache !== null;
  }
}

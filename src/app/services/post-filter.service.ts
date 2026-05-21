import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

// Modo para filtrar posts por tags.
export type PostFilterMatchMode = 'any' | 'all';

// Filtros compartidos entre el sidebar y el feed.
export interface PostFilters {
  tagIds: number[];
  match: PostFilterMatchMode;
  followOnly: boolean;
  query: string;
}

@Injectable({
  providedIn: 'root',
})
export class PostFilterService {
  // Estado central de filtros en Home.
  private readonly filtersSubject = new BehaviorSubject<PostFilters>({
    tagIds: [],
    match: 'any',
    followOnly: false,
    query: '',
  });

  /**
   * Stream con el filtro actual y sus cambios.
   */
  get filters$(): Observable<PostFilters> {
    return this.filtersSubject.asObservable();
  }

  /**
   * Foto del filtro actual.
   */
  get current(): PostFilters {
    return this.filtersSubject.value;
  }

  /**
   * Reemplaza todo el estado de filtros.
   */
  replace(filters: PostFilters): void {
    const normalized = this.normalizeFilters(filters);
    this.filtersSubject.next(normalized);
  }

  /**
   * Cambia solo los tags seleccionados.
   */
  setTagIds(tagIds: number[]): void {
    this.replace({
      ...this.current,
      tagIds,
    });
  }

  /**
   * Cambia el modo entre any y all.
   */
  setMatch(match: PostFilterMatchMode): void {
    this.replace({
      ...this.current,
      match,
    });
  }

  /**
   * Activa o desactiva el filtro de seguidos.
   */
  setFollowOnly(followOnly: boolean): void {
    this.replace({
      ...this.current,
      followOnly,
    });
  }

  /**
   * Actualiza la busqueda de texto.
   */
  setQuery(query: string): void {
    this.replace({
      ...this.current,
      query,
    });
  }

  /**
   * Vuelve a los filtros por defecto.
   */
  clear(): void {
    this.replace({
      tagIds: [],
      match: 'any',
      followOnly: false,
      query: '',
    });
  }

  private normalizeFilters(filters: PostFilters): PostFilters {
    const match: PostFilterMatchMode = filters.match === 'all' ? 'all' : 'any';

    return {
      tagIds: Array.from(new Set(filters.tagIds.filter((id) => Number.isInteger(id) && id > 0))),
      match,
      followOnly: Boolean(filters.followOnly),
      query: String(filters.query ?? '').trim(),
    };
  }
}

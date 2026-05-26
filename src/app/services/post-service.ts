import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import {
  Observable,
  catchError,
  map,
  of,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { LevelRefreshService } from './level-refresh.service';
import { PostFilters } from './post-filter.service';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

interface PaginatedApiResponse<T> extends ApiResponse<T> {
  meta?: {
    currentPage?: number;
    perPage?: number;
    hasMore?: boolean;
    nextPage?: number | null;
  };
}

type UnknownRecord = Record<string, unknown>;

export interface PostPage {
  posts: Post[];
  currentPage: number;
  hasMore: boolean;
  nextPage: number | null;
}

/**
 * Modelo de publicacion usado por feed y creacion de posts.
 */
export interface Post {
  id: number;
  title: string;
  content: string;
  tags: string[];
  tagIds: number[];
  createdAt: string;
  commentsCount: number;
  likesCount: number;
  isPinned: boolean;
  likedByCurrentUser: boolean;
  isSaved: boolean;
  author: {
    id: number;
    name?: string;
    username?: string;
    avatar?: string | null;
  } | null;
}

/**
 * Servicio de publicaciones conectado a la API Laravel.
 *
 * Contrato principal para componentes:
 * - createPost(...) -> Observable<Post>
 * - getPosts(...) -> Observable<Post[]>
 * - getPostsByUser(userId) -> Observable<Post[]>
 */
@Injectable({
  providedIn: 'root',
})
export class PostService {
  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService,
    private readonly levelRefreshService: LevelRefreshService,
  ) {}

  /**
   * Obtiene una pagina del feed principal.
   */
  getPostsPage(filters?: PostFilters, page = 1): Observable<PostPage> {
    const params = this.buildPostListParams(filters, page);
    const requestFactory = () => this.http.get<PaginatedApiResponse<unknown>>(
      `${environment.apiUrl}/api/posts`,
      { withCredentials: true, params },
    ).pipe(
      map((response) => this.normalizePostPage(response)),
    );
    const request$ = filters?.followOnly
      ? this.authService.runWhenAuthenticated(requestFactory)
      : requestFactory();

    return request$.pipe(
      catchError((error: unknown) => this.retryAfterSessionRefresh(error, this.getPostsPage(filters, page))),
    );
  }

  /**
   * Crea un post usando la sesion actual.
   * Si expira CSRF (419), refresca cookie CSRF y reintenta una vez.
   */
  createPost(title: string, content: string, tagIds: number[]): Observable<Post> {
    const request$ = this.authService.runWhenAuthenticated(() => this.http.post<ApiResponse<Post>>(
      `${environment.apiUrl}/api/posts`,
      { title, content, tag_ids: tagIds },
      { withCredentials: true },
    ).pipe(
      map((response) => response.data),
      tap(() => this.levelRefreshService.trigger()),
    ));

    return request$.pipe(
      catchError((error: unknown) => this.retryAfterCsrfRefresh(error, request$)),
    );
  }

  updatePost(postId: number, title: string, content: string, tagIds: number[]): Observable<Post> {
    const request$ = this.authService.runWhenAuthenticated(() => this.http.patch<ApiResponse<Post>>(
      `${environment.apiUrl}/api/posts/${postId}`,
      { title, content, tag_ids: tagIds },
      { withCredentials: true },
    ).pipe(
      map((response) => {
        const normalized = this.normalizeSinglePostPayload(response.data);
        if (normalized !== null) {
          return normalized;
        }

        throw new Error('No se pudo normalizar la publicación actualizada.');
      }),
    ));

    return request$.pipe(
      catchError((error: unknown) => this.retryAfterCsrfRefresh(error, request$)),
    );
  }

  toggleAdminPin(postId: number): Observable<{ id: number; isPinned: boolean }> {
    const request$ = this.authService.runWhenAuthenticated(() => this.http.post<ApiResponse<{ id: number; isPinned: boolean }>>(
      `${environment.apiUrl}/api/admin/posts/${postId}/pin-toggle`,
      {},
      { withCredentials: true },
    ).pipe(
      map((response) => response.data),
    ));

    return request$.pipe(
      catchError((error: unknown) => this.retryAfterCsrfRefresh(error, request$)),
    );
  }

  /**
   * Obtiene publicaciones de un usuario concreto via GET /api/users/{userId}/posts.
   */
  getPostsByUser(userId: number): Observable<Post[]> {
    return this.getPostsByUserPage(userId, 1).pipe(
      switchMap((firstPage) => {
        if (!firstPage.hasMore || firstPage.nextPage === null) {
          return of(firstPage.posts);
        }

        return this.loadRemainingUserPosts(userId, firstPage.posts, firstPage.nextPage);
      }),
    );
  }

  /**
   * Obtiene una publicacion individual via GET /api/posts/{postId}.
   */
  getPostById(postId: number): Observable<Post> {
    const request$ = this.http.get<ApiResponse<unknown>>(
      `${environment.apiUrl}/api/posts/${postId}`,
      { withCredentials: true },
    ).pipe(
      map((response) => {
        const normalized = this.normalizeSinglePostPayload(response.data);
        if (normalized !== null) {
          return normalized;
        }

        throw new Error('No se pudo normalizar la publicacion solicitada.');
      }),
    );

    // GET /api/posts/{id} es publico, no requiere refresh de sesion.
    return request$;
  }

  /**
   * Obtiene publicaciones recientes del backend.
   * Si recibe filtros, los envia como query params (tag_ids[] + match).
   */
  getPosts(filters?: PostFilters): Observable<Post[]> {
    return this.getPostsPage(filters).pipe(
      map((page) => page.posts),
    );
  }

  deletePost(id: number): Observable<void> {
    const request$ = this.authService.runWhenAuthenticated(() => this.http.delete<void>(
      `${environment.apiUrl}/api/posts/${id}`,
      { withCredentials: true },
    ));

    return request$.pipe(
      catchError((error: unknown) => this.retryAfterAuthRefresh(error, request$)),
    );
  }

  getSavedPosts(): Observable<Post[]> {
    const request$ = this.authService.runWhenAuthenticated(() => this.http.get<ApiResponse<unknown>>(
      `${environment.apiUrl}/api/me/saved-posts`,
      { withCredentials: true },
    ).pipe(
      map((response) => this.normalizePostsPayload(response.data)),
    ));

    return request$.pipe(
      catchError((error: unknown) => this.retryAfterSessionRefresh(error, request$)),
    );
  }

  getLikedPosts(): Observable<Post[]> {
    const request$ = this.authService.runWhenAuthenticated(() => this.http.get<ApiResponse<unknown>>(
      `${environment.apiUrl}/api/me/liked-posts`,
      { withCredentials: true },
    ).pipe(
      map((response) => this.normalizePostsPayload(response.data)),
    ));

    return request$.pipe(
      catchError((error: unknown) => this.retryAfterSessionRefresh(error, request$)),
    );
  }

  savePost(postId: number): Observable<Post> {
    const request$ = this.authService.runWhenAuthenticated(() => this.http.post<ApiResponse<unknown>>(
      `${environment.apiUrl}/api/posts/${postId}/save`,
      {},
      { withCredentials: true },
    ).pipe(
      map((response) => {
        const normalized = this.normalizeSinglePostPayload(response.data);
        if (normalized !== null) {
          return normalized;
        }

        throw new Error('No se pudo normalizar la publicación guardada.');
      }),
    ));

    return request$.pipe(
      catchError((error: unknown) => this.retryAfterCsrfRefresh(error, request$)),
    );
  }

  unsavePost(postId: number): Observable<Post> {
    const request$ = this.authService.runWhenAuthenticated(() => this.http.delete<ApiResponse<unknown>>(
      `${environment.apiUrl}/api/posts/${postId}/save`,
      { withCredentials: true },
    ).pipe(
      map((response) => {
        const normalized = this.normalizeSinglePostPayload(response.data);
        if (normalized !== null) {
          return normalized;
        }

        throw new Error('No se pudo normalizar la publicación desguardada.');
      }),
    ));

    return request$.pipe(
      catchError((error: unknown) => this.retryAfterCsrfRefresh(error, request$)),
    );
  }

  // Reintenta una request cuando falta refrescar la sesión.
  private retryAfterSessionRefresh<T>(error: unknown, request$: Observable<T>): Observable<T> {
    if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
      return throwError(() => error);
    }

    return this.authService.me().pipe(
      switchMap(() => request$),
    );
  }

  // Reintenta una request cuando solo falta renovar la cookie CSRF.
  private retryAfterCsrfRefresh<T>(error: unknown, request$: Observable<T>): Observable<T> {
    if (!(error instanceof HttpErrorResponse) || error.status !== 419) {
      return throwError(() => error);
    }

    return this.authService.csrf().pipe(
      switchMap(() => request$),
    );
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

  private normalizePostsPayload(data: unknown): Post[] {
    const direct = this.asPostArray(data);
    if (direct !== null) {
      return direct;
    }

    if (!this.isRecord(data)) {
      return [];
    }

    const level1 = this.asPostArray(data['data']);
    if (level1 !== null) {
      return level1;
    }

    const postList = this.asPostArray(data['posts']);
    if (postList !== null) {
      return postList;
    }

    if (this.isRecord(data['data'])) {
      const level2 = this.asPostArray((data['data'] as UnknownRecord)['data']);
      if (level2 !== null) {
        return level2;
      }

      const level2Posts = this.asPostArray((data['data'] as UnknownRecord)['posts']);
      if (level2Posts !== null) {
        return level2Posts;
      }
    }

    return [];
  }

  private normalizePostPage(response: PaginatedApiResponse<unknown>): PostPage {
    const posts = this.normalizePostsPayload(response.data);
    const meta = this.isRecord(response.meta) ? response.meta as UnknownRecord : {};

    return {
      posts,
      currentPage: this.toNumber(meta['currentPage'] ?? meta['current_page']) ?? 1,
      hasMore: this.toBoolean(meta['hasMore'] ?? meta['has_more']),
      nextPage: this.toNumber(meta['nextPage'] ?? meta['next_page']),
    };
  }

  private asPostArray(value: unknown): Post[] | null {
    if (!Array.isArray(value)) {
      return null;
    }

    const posts = value
      .map((item) => this.normalizePost(item))
      .filter((item): item is Post => item !== null);

    return posts;
  }

  private normalizeSinglePostPayload(payload: unknown): Post | null {
    const candidate = this.unwrapSinglePost(payload);
    return this.normalizePost(candidate);
  }

  private unwrapSinglePost(value: unknown, depth = 0): unknown {
    if (depth > 4 || value == null) {
      return null;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return null;
      }
      return this.unwrapSinglePost(value[0], depth + 1);
    }

    if (!this.isRecord(value)) {
      return value;
    }

    const keys: Array<keyof UnknownRecord> = ['post', 'data', 'item', 'result'];
    for (const key of keys) {
      if (key in value) {
        const unwrapped = this.unwrapSinglePost(value[key], depth + 1);
        if (unwrapped !== null) {
          return unwrapped;
        }
      }
    }

    return value;
  }

  private normalizePost(value: unknown): Post | null {
    if (!this.isRecord(value)) {
      return null;
    }

    const id = this.toNumber(value['id'] ?? value['post_id']);
    if (id === null || id <= 0) {
      return null;
    }

    const title = this.toText(value['title']);
    const content = this.toText(value['content']);
    const tags = this.normalizeTags(value['tags']);
    const tagIds = this.normalizeTagIds(value['tagItems'] ?? value['tag_items']);
    const createdAt = this.toText(value['createdAt'] ?? value['created_at']);
    const commentsCount = this.toCount(value['commentsCount'] ?? value['comments_count']);
    const likesCount = this.toCount(value['likesCount'] ?? value['likes_count']);
    const likedByCurrentUser = this.toBoolean(value['likedByCurrentUser'] ?? value['liked_by_current_user']);
    const isSaved = this.toBoolean(value['isSaved'] ?? value['is_saved']);
    const isPinned = this.toBoolean(value['isPinned'] ?? value['is_pinned']);
    const author = this.normalizeAuthor(value['author'] ?? value['user']);

    return {
      id,
      title,
      content,
      tags,
      tagIds,
      createdAt,
      commentsCount,
      likesCount,
      isPinned,
      likedByCurrentUser,
      isSaved,
      author,
    };
  }

  private normalizeAuthor(value: unknown): Post['author'] {
    if (!this.isRecord(value)) {
      return null;
    }

    const id = this.toNumber(value['id'] ?? value['user_id']) ?? 0;
    const name = this.optionalText(value['name']);
    const username = this.optionalText(value['username']);
    const avatar = typeof value['avatar'] === 'string' ? value['avatar'] : null;

    return { id, name, username, avatar };
  }

  private normalizeTags(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value
        .map((tag) => this.toText(tag))
        .filter((tag) => tag.length > 0);
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    }

    return [];
  }

  private normalizeTagIds(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((tag) => {
        if (!this.isRecord(tag)) {
          return null;
        }

        return this.toNumber(tag['id']);
      })
      .filter((id): id is number => id !== null && id > 0);
  }

  private toText(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private optionalText(value: unknown): string | undefined {
    const text = this.toText(value).trim();
    return text.length > 0 ? text : undefined;
  }

  private toNumber(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private toCount(value: unknown): number {
    const count = this.toNumber(value);
    return count !== null && count >= 0 ? count : 0;
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === 'true' || normalized === '1';
    }

    return false;
  }

  private buildPostListParams(filters: PostFilters | undefined, page: number): HttpParams {
    let params = new HttpParams().set('page', String(Math.max(1, page)));

    if (filters && filters.tagIds.length > 0) {
      params = params.set('match', filters.match);
      filters.tagIds.forEach((id) => {
        params = params.append('tag_ids[]', String(id));
      });
    }

    if (filters && filters.query.trim() !== '') {
      params = params.set('q', filters.query.trim());
    }

    if (filters?.followOnly) {
      params = params.set('feed', 'following');
    }

    return params;
  }

  private getPostsByUserPage(userId: number, page: number): Observable<PostPage> {
    const params = new HttpParams().set('page', String(Math.max(1, page)));

    return this.http.get<PaginatedApiResponse<unknown>>(
      `${environment.apiUrl}/api/users/${userId}/posts`,
      { withCredentials: true, params },
    ).pipe(
      map((response) => this.normalizePostPage(response)),
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
          return throwError(() => error);
        }

        return this.authService.me().pipe(
          switchMap(() => this.getPostsByUserPage(userId, page)),
        );
      }),
    );
  }

  private loadRemainingUserPosts(userId: number, acc: Post[], nextPage: number): Observable<Post[]> {
    return this.getPostsByUserPage(userId, nextPage).pipe(
      switchMap((page) => {
        const merged = [...acc, ...page.posts];
        if (!page.hasMore || page.nextPage === null) {
          return of(merged);
        }

        return this.loadRemainingUserPosts(userId, merged, page.nextPage);
      }),
    );
  }

  private isRecord(value: unknown): value is UnknownRecord {
    return Boolean(value) && typeof value === 'object';
  }
}


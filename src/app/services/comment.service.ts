import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap, tap, throwError, catchError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { LevelRefreshService } from './level-refresh.service';

export interface PostComment {
  id: number;
  postId: number;
  userId: number;
  username: string;
  text: string;
  createdAt: string;
  likesCount: number;
  likedByCurrentUser: boolean;
  isPinned: boolean;
  parentId: number | null;
  replies?: PostComment[];
}

@Injectable({ providedIn: 'root' })
/**
 * Manages post comments against the Laravel backend.
 *
 * Strategy:
 * - Comments are fetched from the backend on demand (when a post panel opens).
 * - Results are cached in memory so re-opening the same panel avoids a second request.
 * - New comments are posted to the backend and appended to the local cache.
 */
export class CommentService {
  private readonly http        = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly levelRefreshService = inject(LevelRefreshService);
  private readonly cache       = new Map<number, PostComment[]>();

  private fetchCommentTree(postId: number): Observable<PostComment[]> {
    return this.http
      .get<{ data: PostComment[] }>(
        `${environment.apiUrl}/api/posts/${postId}/comments`,
        { withCredentials: true },
      )
      .pipe(map((res) => this.normalizeCommentTree(res.data)));
  }

  loadCommentTree(postId: number): Observable<PostComment[]> {
    return this.fetchCommentTree(postId).pipe(
      tap((roots) => this.cache.set(postId, this.flattenOneLevel(roots))),
    );
  }

  loadComments(postId: number): Observable<PostComment[]> {
    return this.fetchCommentTree(postId).pipe(
      map((roots) => this.flattenOneLevel(roots)),
      tap((comments) => this.cache.set(postId, comments)),
    );
  }

  addComment(postId: number, text: string, parentId?: number | null): Observable<PostComment> {
    const payload: { text: string; parent_id?: number } = { text };
    if (parentId !== undefined && parentId !== null) {
      payload.parent_id = parentId;
    }

    const request$ = this.authService.runWhenAuthenticated(() => this.http
      .post<{ data: PostComment }>(
        `${environment.apiUrl}/api/posts/${postId}/comments`,
        payload,
        { withCredentials: true },
      )
      .pipe(
        map((res) => this.normalizeCommentNode(res.data, true)),
        tap((comment) => {
          const current = this.cache.get(postId) ?? [];
          this.cache.set(postId, [...current, comment]);
          this.levelRefreshService.trigger();
        }),
      ));

    return request$.pipe(
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 419) {
          return throwError(() => error);
        }
        return this.authService.csrf().pipe(switchMap(() => request$));
      }),
    );
  }

  deleteComment(id: number): Observable<void> {
    return this.authService.runWhenAuthenticated(() => this.http.delete<void>(
      `${environment.apiUrl}/api/comments/${id}`,
      { withCredentials: true },
    ));
  }

  updateComment(commentId: number, text: string): Observable<PostComment> {
    const request$ = this.authService.runWhenAuthenticated(() => this.http
      .patch<{ data: PostComment }>(
        `${environment.apiUrl}/api/comments/${commentId}`,
        { text },
        { withCredentials: true },
      )
      .pipe(map((res) => this.normalizeCommentNode(res.data, true))));

    return request$.pipe(
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 419) {
          return throwError(() => error);
        }
        return this.authService.csrf().pipe(switchMap(() => request$));
      }),
    );
  }

  toggleAdminPin(commentId: number): Observable<{ id: number; postId: number; isPinned: boolean }> {
    const request$ = this.authService.runWhenAuthenticated(() => this.http
      .post<{ data: { id: number; postId: number; isPinned: boolean } }>(
        `${environment.apiUrl}/api/admin/comments/${commentId}/pin-toggle`,
        {},
        { withCredentials: true },
      )
      .pipe(map((res) => res.data)));

    return request$.pipe(
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 419) {
          return throwError(() => error);
        }
        return this.authService.csrf().pipe(switchMap(() => request$));
      }),
    );
  }

  getCommentCountByUser(userId: number): number {
    let count = 0;
    this.cache.forEach((comments) => {
      count += comments.filter((c) => c.userId === userId).length;
    });
    return count;
  }

  private flattenOneLevel(roots: PostComment[]): PostComment[] {
    return roots.flatMap((root) => [root, ...(root.replies ?? [])]);
  }

  private normalizeCommentTree(comments: PostComment[]): PostComment[] {
    return comments.map((comment) => this.normalizeCommentNode(comment, true));
  }

  private normalizeCommentNode(comment: PostComment, includeReplies: boolean): PostComment {
    const normalized: PostComment = {
      id: Number(comment.id),
      postId: Number(comment.postId),
      userId: Number(comment.userId),
      username: comment.username ?? 'Usuario',
      text: comment.text ?? '',
      createdAt: comment.createdAt ?? '',
      likesCount: Number(comment.likesCount ?? 0),
      likedByCurrentUser: Boolean(comment.likedByCurrentUser),
      isPinned: Boolean(comment.isPinned),
      parentId: comment.parentId ?? null,
    };

    if (includeReplies) {
      normalized.replies = Array.isArray(comment.replies)
        ? comment.replies.map((reply) => this.normalizeCommentNode(reply, false))
        : [];
    }

    return normalized;
  }
}

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { PostComment } from './comment.service';
import { LevelRefreshService } from './level-refresh.service';
import { Post } from './post-service';

interface LikeState {
  likesCount: number;
  likedByCurrentUser: boolean;
}

@Injectable({ providedIn: 'root' })
/**
 * Persists post/comment likes against Laravel and keeps a lightweight local cache
 * for immediate UI feedback.
 */
export class LikeService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly levelRefreshService = inject(LevelRefreshService);

  // Lightweight UI cache keyed by entity id, hydrated from backend payloads.
  private readonly postState = new Map<number, LikeState>();
  private readonly commentState = new Map<number, LikeState>();

  /** Initializes post like state from API feed data. */
  hydratePosts(posts: readonly Post[]): void {
    posts.forEach((post) => {
      this.postState.set(post.id, {
        likesCount: post.likesCount ?? 0,
        likedByCurrentUser: post.likedByCurrentUser ?? false,
      });
    });
  }

  /** Initializes comment like state from API comment payloads. */
  hydrateComments(comments: readonly PostComment[]): void {
    comments.forEach((comment) => {
      this.commentState.set(comment.id, {
        likesCount: comment.likesCount ?? 0,
        likedByCurrentUser: comment.likedByCurrentUser ?? false,
      });
    });
  }

  removePost(postId: number): void {
    this.postState.delete(postId);
  }

  removeComment(commentId: number): void {
    this.commentState.delete(commentId);
  }

  togglePostLike(postId: number): void {
    const previous = this.postState.get(postId) ?? { likesCount: 0, likedByCurrentUser: false };
    const optimistic = this.nextState(previous);
    // Optimistic update: reflect instantly in UI before server round-trip.
    this.postState.set(postId, optimistic);

    this.authService.runWhenAuthenticated(() => this.http
      .post<{ data?: { liked?: boolean; likesCount?: number } }>(
        `${environment.apiUrl}/api/posts/${postId}/likes/toggle`,
        {},
        { withCredentials: true },
      ))
      .subscribe({
        next: (res) => {
          // Reconcile local state with canonical backend response.
          const liked = res?.data?.liked ?? optimistic.likedByCurrentUser;
          const likesCount = res?.data?.likesCount ?? optimistic.likesCount;
          this.postState.set(postId, { likedByCurrentUser: liked, likesCount });
          this.levelRefreshService.trigger();
        },
        error: () => {
          // Rollback on failure to keep UI consistent with persisted state.
          this.postState.set(postId, previous);
        },
      });
  }

  getPostLikeCount(postId: number): number {
    return this.postState.get(postId)?.likesCount ?? 0;
  }

  hasLikedPost(postId: number): boolean {
    return this.postState.get(postId)?.likedByCurrentUser ?? false;
  }

  toggleCommentLike(commentId: number): void {
    const previous = this.commentState.get(commentId) ?? { likesCount: 0, likedByCurrentUser: false };
    const optimistic = this.nextState(previous);
    // Optimistic update: reflect instantly in UI before server round-trip.
    this.commentState.set(commentId, optimistic);

    this.authService.runWhenAuthenticated(() => this.http
      .post<{ data?: { liked?: boolean; likesCount?: number } }>(
        `${environment.apiUrl}/api/comments/${commentId}/likes/toggle`,
        {},
        { withCredentials: true },
      ))
      .subscribe({
        next: (res) => {
          // Reconcile local state with canonical backend response.
          const liked = res?.data?.liked ?? optimistic.likedByCurrentUser;
          const likesCount = res?.data?.likesCount ?? optimistic.likesCount;
          this.commentState.set(commentId, { likedByCurrentUser: liked, likesCount });
          this.levelRefreshService.trigger();
        },
        error: () => {
          // Rollback on failure to keep UI consistent with persisted state.
          this.commentState.set(commentId, previous);
        },
      });
  }

  getCommentLikeCount(commentId: number): number {
    return this.commentState.get(commentId)?.likesCount ?? 0;
  }

  hasLikedComment(commentId: number): boolean {
    return this.commentState.get(commentId)?.likedByCurrentUser ?? false;
  }

  private nextState(state: LikeState): LikeState {
    if (state.likedByCurrentUser) {
      return {
        likedByCurrentUser: false,
        likesCount: Math.max(0, state.likesCount - 1),
      };
    }

    return {
      likedByCurrentUser: true,
      likesCount: state.likesCount + 1,
    };
  }
}

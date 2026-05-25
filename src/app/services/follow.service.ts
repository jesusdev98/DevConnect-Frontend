import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { PublicUser, UserService } from './user.service';

interface FollowState {
  followersCount: number;
  followedByCurrentUser: boolean;
}

@Injectable({ providedIn: 'root' })
/**
 * Persists follow relations against Laravel and mirrors counters/state in-memory
 * for immediate UI feedback.
 */
export class FollowService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);

  // Per-user follow state used by Home/Profile widgets.
  private readonly state = new Map<number, FollowState>();

  constructor() {
    // Initial hydration from backend so seed/demo data is reflected on first paint.
    this.userService.getUsers().subscribe((users) => {
      this.hydrateFromUsers(users);
    });
  }

  toggle(followerId: number, targetId: number): void {
    this.toggleWithResult(followerId, targetId).subscribe();
  }

  toggleWithResult(followerId: number, targetId: number): Observable<FollowState> {
    if (followerId === targetId) {
      return of(this.state.get(targetId) ?? { followersCount: 0, followedByCurrentUser: false });
    }

    const previous = this.state.get(targetId) ?? { followersCount: 0, followedByCurrentUser: false };
    const optimistic = this.nextState(previous);
    // Optimistic update for responsive follow/unfollow UX.
    this.state.set(targetId, optimistic);

    return this.authService.runWhenAuthenticated(() => this.http
      .post<{ data?: { following?: boolean; followersCount?: number } }>(
        `${environment.apiUrl}/api/users/${targetId}/follow/toggle`,
        {},
        { withCredentials: true },
      )
      .pipe(
        map((res) => {
          const following = res?.data?.following ?? optimistic.followedByCurrentUser;
          const followersCount = res?.data?.followersCount ?? optimistic.followersCount;
          return {
            followedByCurrentUser: following,
            followersCount,
          } satisfies FollowState;
        }),
        tap((state) => {
          this.state.set(targetId, state);
        }),
        catchError(() => {
          this.state.set(targetId, previous);
          return of(previous);
        }),
      ));
  }

  isFollowing(targetId: number): boolean {
    return this.state.get(targetId)?.followedByCurrentUser ?? false;
  }

  getFollowerCount(targetId: number): number {
    return this.state.get(targetId)?.followersCount ?? 0;
  }

  private hydrateFromUsers(users: readonly PublicUser[]): void {
    users.forEach((user) => {
      this.state.set(user.id, {
        followersCount: user.followersCount ?? 0,
        followedByCurrentUser: user.followedByCurrentUser ?? false,
      });
    });
  }

  private nextState(state: FollowState): FollowState {
    if (state.followedByCurrentUser) {
      return {
        followedByCurrentUser: false,
        followersCount: Math.max(0, state.followersCount - 1),
      };
    }

    return {
      followedByCurrentUser: true,
      followersCount: state.followersCount + 1,
    };
  }
}

import { Component, inject } from '@angular/core';
import { map, shareReplay } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { FollowService } from '../../services/follow.service';
import { HomeSidebarService } from '../../services/home-sidebar.service';
import { UiFeedbackService } from '../../services/ui-feedback.service';

interface ActiveDev {
  id: number;
  name: string;
  username: string;
  initials: string;
  avatarSafe: string | null;
  postCount: number;
}

interface TrendingTag {
  name: string;
  posts: number;
}

@Component({
  selector: 'app-home-right-aside',
  standalone: false,
  templateUrl: './home-right-aside.html',
  styleUrl: './home-right-aside.scss',
})
export class HomeRightAside {
  private readonly homeSidebarService = inject(HomeSidebarService);
  private readonly followService = inject(FollowService);
  private readonly authService = inject(AuthService);
  private readonly feedback = inject(UiFeedbackService);

  // Normalizamos el payload ligero del sidebar para la vista.
  private readonly sidebarData$ = this.homeSidebarService.getSidebarData().pipe(
    map((data) => ({
      activeDevs: data.activeDevs
        .map((dev): ActiveDev => {
          const displayName = dev.name || dev.username || 'Usuario';
          const rawAvatar = dev.avatar ?? null;

          return {
            id: dev.id,
            name: displayName,
            username: dev.username,
            avatarSafe: this.isAllowedAvatarDataUrl(rawAvatar) ? rawAvatar : null,
            initials: displayName
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((word) => word[0].toUpperCase())
              .join(''),
            postCount: dev.postsCount,
          };
        })
        .slice(0, 5),
      trendingTags: data.trendingTags
        .map((tag): TrendingTag => ({ name: tag.name, posts: tag.postsCount }))
        .slice(0, 5),
    })),
    shareReplay(1),
  );

  readonly activeDevs$ = this.sidebarData$.pipe(
    map((data) => data.activeDevs),
  );

  readonly trendingTags$ = this.sidebarData$.pipe(
    map((data) => data.trendingTags),
  );

  // El follow depende del usuario autenticado y del estado en memoria.
  isFollowingDev(devId: number): boolean {
    const userId = this.authService.getCurrentUser()?.id;
    return userId ? this.followService.isFollowing(devId) : false;
  }

  // Toggle simple con feedback inmediato para no esperar a recargar.
  toggleFollow(dev: ActiveDev): void {
    const userId = this.authService.getCurrentUser()?.id;
    if (!userId) {
      return;
    }

    // Toggle optimista + feedback inmediato en UI.
    const wasFollowing = this.isFollowingDev(dev.id);
    this.followService.toggle(userId, dev.id);
    this.feedback.info(wasFollowing ? `Has dejado de seguir a ${dev.name}.` : `Ahora sigues a ${dev.name}.`);
  }

  getDevFollowerCount(devId: number): number {
    return this.followService.getFollowerCount(devId);
  }

  getFollowAriaLabel(devId: number): string {
    return this.isFollowingDev(devId) ? 'Dejar de seguir usuario' : 'Seguir usuario';
  }

  getDevProfileRoute(dev: ActiveDev): string | string[] {
    const username = dev.username.trim();
    return username ? ['/profile', username] : '/profile';
  }

  private isAllowedAvatarDataUrl(value: string | null): value is string {
    return typeof value === 'string' && /^data:image\/(?:jpeg|jpg|png|gif|webp);base64,/i.test(value);
  }
}

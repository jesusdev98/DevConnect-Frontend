import { Component, Input, inject } from '@angular/core';
import { BehaviorSubject, catchError, distinctUntilChanged, map, Observable, of, shareReplay, startWith, switchMap } from 'rxjs';
import { UserAchievement, UserService } from '../../services/user.service';

type AchievementState =
  | { status: 'idle'; achievements: UserAchievement[] }
  | { status: 'loading'; achievements: UserAchievement[] }
  | { status: 'loaded'; achievements: UserAchievement[] }
  | { status: 'error'; achievements: UserAchievement[] };

@Component({
  selector: 'app-profile-achievements-tab',
  standalone: false,
  templateUrl: './profile-achievements-tab.html',
  styleUrl: './profile-achievements-tab.scss',
})
export class ProfileAchievementsTab {
  private readonly userService = inject(UserService);
  private readonly userIdSubject = new BehaviorSubject<number | null>(null);

  @Input()
  set userId(value: number | null) {
    if (this.userIdSubject.value === value) {
      return;
    }

    this.userIdSubject.next(value);
  }

  get userId(): number | null {
    return this.userIdSubject.value;
  }

  readonly achievementsState$: Observable<AchievementState> = this.userIdSubject.asObservable().pipe(
    distinctUntilChanged(),
    switchMap((userId) => {
      if (!userId) {
        return of<AchievementState>({ status: 'idle', achievements: [] });
      }

      return this.userService.getUserAchievements(userId).pipe(
        map((achievements) => ({ status: 'loaded', achievements }) as AchievementState),
        startWith({ status: 'loading', achievements: [] } as AchievementState),
        catchError(() => of<AchievementState>({ status: 'error', achievements: [] })),
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}

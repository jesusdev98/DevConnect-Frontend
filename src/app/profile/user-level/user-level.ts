import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { LevelRefreshService } from '../../services/level-refresh.service';
import { UiFeedbackService } from '../../services/ui-feedback.service';
import { UserLevel, UserService } from '../../services/user.service';

@Component({
  selector: 'app-user-level',
  standalone: false,
  templateUrl: './user-level.html',
  styleUrl: './user-level.scss',
})
export class UserLevelComponent implements OnInit, OnChanges, OnDestroy {
  private readonly userService = inject(UserService);
  private readonly levelRefreshService = inject(LevelRefreshService);
  private readonly uiFeedback = inject(UiFeedbackService);
  private readonly destroy$ = new Subject<void>();
  private levelRequestSub: Subscription | null = null;
  private currentRequestUserId: number | null = null;
  private cache = new Map<number, { data: UserLevel; timestamp: number }>();
  private readonly CACHE_TTL = 30_000; // 30 seconds
  private animationFrameId: number | null = null;
  private levelUpTimerId: ReturnType<typeof setTimeout> | null = null;
  private previousLevel: number | null = null;
  private isRefreshingExternally = false;

  @Input() userId: number | null = null;
  @Input() compact = false;
  @Output() readonly levelChange = new EventEmitter<number>();

  levelData: UserLevel | null = null;
  animatedProgress = 0;
  isLevelUp = false;
  isLoading = false;
  hasError = false;

  ngOnInit(): void {
    this.levelRefreshService.refresh$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.isLoading || this.isRefreshingExternally) return;
        this.refresh();
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      !changes['userId'] ||
      changes['userId'].previousValue === changes['userId'].currentValue
    ) {
      return;
    }

    const change = changes['userId'];
    const userId: number | null = change.currentValue ?? null;

    if (!userId) {
      this.resetState();
      return;
    }

    const cached = this.cache.get(userId);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      // Cancel any in-flight request before serving cached state.
      this.levelRequestSub?.unsubscribe();
      this.levelRequestSub = null;
      this.currentRequestUserId = null;
      this.applyLevelData(cached.data);
      this.isLoading = false;
      this.hasError = false;
      return;
    }

    this.fetchLevel(userId);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.resetState();
  }

  get currentXP(): number {
    return this.levelData?.points ?? 0;
  }

  get nextXP(): number | null {
    return this.levelData?.nextLevelPoints ?? null;
  }

  get progressLabel(): string {
    const percentage = this.levelData?.progressPercentage ?? 0;
    return `${Math.round(percentage)}%`;
  }

  get nextLevelLabel(): number {
    return (this.levelData?.level ?? 0) + 1;
  }

  get badgeLevelClass(): string {
    const level = this.levelData?.level ?? 1;
    const clampedLevel = Math.max(1, Math.min(5, Math.floor(level)));
    return `level-${clampedLevel}`;
  }

  get levelTheme(): 'neutral' | 'blue' | 'purple' | 'gold' {
    const lvl = this.levelData?.level ?? 0;

    if (lvl >= 10) return 'gold';
    if (lvl >= 7) return 'purple';
    if (lvl >= 4) return 'blue';
    return 'neutral';
  }

  public refresh(): void {
    if (!this.userId) return;

    this.cache.delete(this.userId);
    this.levelRequestSub?.unsubscribe();
    this.levelRequestSub = null;
    this.currentRequestUserId = null;
    this.fetchLevel(this.userId);
  }

  private resetState(): void {
    this.levelRequestSub?.unsubscribe();
    this.levelRequestSub = null;
    this.currentRequestUserId = null;
    this.stopProgressAnimation();
    this.stopLevelUpAnimation();
    this.levelData = null;
    this.previousLevel = null;
    this.animatedProgress = 0;
    this.isLoading = false;
    this.hasError = false;
  }

  private fetchLevel(userId: number): void {
    if (this.isLoading && this.currentRequestUserId === userId) return;

    this.levelRequestSub?.unsubscribe();
    this.currentRequestUserId = userId;
    this.isRefreshingExternally = true;

    this.isLoading = true;
    this.hasError = false;

    this.levelRequestSub = this.userService.getUserLevel(userId).subscribe({
      next: (level) => {
        // Ignore stale responses from superseded requests.
        if (this.currentRequestUserId !== userId) return;

        this.cache.set(userId, {
          data: level,
          timestamp: Date.now(),
        });
        this.applyLevelData(level);
        this.isLoading = false;
        this.hasError = false;
        this.currentRequestUserId = null;
        this.isRefreshingExternally = false;
      },
      error: () => {
        if (this.currentRequestUserId !== userId) return;

        this.stopProgressAnimation();
        this.stopLevelUpAnimation();
        this.levelData = null;
        this.previousLevel = null;
        this.animatedProgress = 0;
        this.isLoading = false;
        this.hasError = true;
        this.currentRequestUserId = null;
        this.isRefreshingExternally = false;
      },
    });
  }

  private applyLevelData(level: UserLevel): void {
    this.levelData = level;
    this.levelChange.emit(level.level);
    this.animateProgressTo(level.progressPercentage);

    if (this.previousLevel !== null && level.level > this.previousLevel) {
      this.triggerLevelUpAnimation();
      this.uiFeedback.success(`¡Has subido a nivel ${level.level}!`);
    }

    this.previousLevel = level.level;
  }

  private animateProgressTo(target: number): void {
    this.stopProgressAnimation();

    const clampedTarget = Math.max(0, Math.min(100, target));
    const start = Math.max(0, Math.min(100, this.animatedProgress));
    const durationMs = 500;
    const startAt = performance.now();

    const step = (now: number): void => {
      const elapsed = now - startAt;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);

      this.animatedProgress = start + (clampedTarget - start) * eased;

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(step);
        return;
      }

      this.animatedProgress = clampedTarget;
      this.animationFrameId = null;
    };

    this.animationFrameId = requestAnimationFrame(step);
  }

  private stopProgressAnimation(): void {
    if (this.animationFrameId === null) return;

    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  private triggerLevelUpAnimation(): void {
    this.stopLevelUpAnimation();
    this.isLevelUp = true;
    this.levelUpTimerId = setTimeout(() => {
      this.isLevelUp = false;
      this.levelUpTimerId = null;
    }, 600);
  }

  private stopLevelUpAnimation(): void {
    if (this.levelUpTimerId !== null) {
      clearTimeout(this.levelUpTimerId);
      this.levelUpTimerId = null;
    }

    this.isLevelUp = false;
  }

  // Future improvement:
  // Replace manual subscription with RxJS switchMap or Angular Signals
  // to fully eliminate manual lifecycle handling and side effects
}




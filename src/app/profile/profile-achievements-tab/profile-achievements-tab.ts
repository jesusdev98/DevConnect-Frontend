import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { UserAchievement, UserService } from '../../services/user.service';

@Component({
  selector: 'app-profile-achievements-tab',
  standalone: false,
  templateUrl: './profile-achievements-tab.html',
  styleUrl: './profile-achievements-tab.scss',
})
export class ProfileAchievementsTab implements OnChanges {
  private readonly userService = inject(UserService);
  private requestId = 0;

  @Input() userId: number | null = null;

  achievements: UserAchievement[] = [];
  isLoading = false;
  hasError = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['userId']) {
      return;
    }

    if (this.userId) {
      this.fetchAchievements(this.userId);
      return;
    }

    this.requestId++;
    this.achievements = [];
    this.isLoading = false;
    this.hasError = false;
  }

  private fetchAchievements(userId: number): void {
    const currentRequestId = ++this.requestId;

    this.isLoading = true;
    this.hasError = false;
    this.achievements = [];

    this.userService.getUserAchievements(userId).subscribe({
      next: (data) => {
        if (currentRequestId !== this.requestId) return;

        this.achievements = data;
        this.isLoading = false;
      },
      error: () => {
        if (currentRequestId !== this.requestId) return;

        this.hasError = true;
        this.isLoading = false;
      },
    });
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}

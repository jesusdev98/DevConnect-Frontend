import { Component, OnDestroy, inject } from '@angular/core';
import { Observable, Subject, map, of, switchMap, take, takeUntil, tap } from 'rxjs';
import { PublicUser, UserService } from '../../services/user.service';
import { ConfirmModalService } from '../../shared/confirm-modal/confirm-modal.service';

@Component({
  selector: 'app-profile-admin-tab',
  standalone: false,
  templateUrl: './profile-admin-tab.html',
  styleUrl: './profile-admin-tab.scss',
})
export class ProfileAdminTab implements OnDestroy {
  private readonly userService = inject(UserService);
  private readonly confirmModal = inject(ConfirmModalService);
  private readonly destroy$ = new Subject<void>();
  private readonly searchTerm$ = new Subject<string>();
  private readonly SEARCH_LIMIT = 10;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  searchTerm: string = '';
  users: PublicUser[] = [];
  filteredUsers: PublicUser[] = [];
  filteredUsers$: Observable<PublicUser[]>;
  isDeletingMap: Record<number, boolean> = {};
  toastMessage: string | null = null;
  toastType: 'success' | 'error' | null = null;

  constructor() {
    this.filteredUsers$ = this.searchTerm$.pipe(
      map((value) => value.trim()),
      switchMap((normalized) => this.searchUsers$(normalized)),
      tap((filteredUsers) => {
        this.filteredUsers = filteredUsers;
      }),
      takeUntil(this.destroy$),
    );
  }

  onSearchTermChange(value: string): void {
    this.searchTerm = value;
    const normalized = value.trim();
    const query = normalized.startsWith('@') ? normalized.slice(1).trim() : '';

    if (!normalized.startsWith('@') || query.length < 2) {
      this.users = [];
      this.filteredUsers = [];
      this.searchTerm$.next(value);
      return;
    }

    this.searchTerm$.next(value);
  }

  trackByUserId(index: number, user: PublicUser): number | string {
    return user.id ?? user.username ?? index;
  }

  ngOnDestroy(): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  async onDeleteUser(user: PublicUser): Promise<void> {
    const userId = Number(user.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      return;
    }

    const username = user.username ?? 'unknown';
    const confirmed = await this.confirmModal.confirm(`¿Eliminar la cuenta de @${username}?`);
    if (!confirmed) {
      return;
    }

    if (this.isDeletingMap[userId]) {
      return;
    }

    this.isDeletingMap[userId] = true;

    this.userService.deleteUserByAdmin(userId).subscribe({
      next: () => {
        this.users = this.users.filter((currentUser) => Number(currentUser.id) !== userId);
        this.filteredUsers = this.filteredUsers.filter(
          (currentUser) => Number(currentUser.id) !== userId,
        );
        this.refreshUsers()
          .pipe(take(1))
          .subscribe(() => {
            this.searchTerm$.next(this.searchTerm);
          });
        delete this.isDeletingMap[userId];
        this.showToast('Usuario eliminado correctamente', 'success');
      },
      error: () => {
        delete this.isDeletingMap[userId];
        this.showToast('No se pudo eliminar el usuario', 'error');
      },
    });
  }

  private searchUsers$(normalized: string): Observable<PublicUser[]> {
    if (!normalized.startsWith('@')) {
      return of([]);
    }

    const query = this.normalizeQuery(normalized);
    if (query.length < 2) {
      return of([]);
    }

    return this.searchLocal(query).pipe(
      switchMap((users) =>
        users.length > 0
          ? of(users)
          : this.refreshUsers().pipe(
              switchMap(() => this.searchLocal(query)),
              switchMap((refreshedUsers) =>
                refreshedUsers.length > 0
                  ? of(refreshedUsers)
                  : this.refreshUsers().pipe(switchMap(() => this.searchLocal(query))),
              ),
            ),
      ),
    );
  }

  private normalizeQuery(query: string): string {
    return query.slice(1).trim();
  }

  private searchLocal(query: string): Observable<PublicUser[]> {
    return this.userService.searchUsersLocal(query, this.SEARCH_LIMIT).pipe(
      tap((filteredUsers) => {
        this.filteredUsers = filteredUsers;
      }),
    );
  }

  private refreshUsers(): Observable<PublicUser[]> {
    return this.userService.getUsers(true).pipe(
      tap((users) => {
        this.users = users;
      }),
    );
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastType = type;

    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }

    this.toastTimeout = setTimeout(() => {
      this.toastMessage = null;
      this.toastType = null;
    }, 2500);
  }
}

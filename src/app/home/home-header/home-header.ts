import { Component, inject, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { AuthService, AuthUser } from '../../services/auth.service';
import { PostFilterService } from '../../services/post-filter.service';
import { PublicUser, UserService } from '../../services/user.service';

@Component({
  selector: 'app-home-header',
  standalone: false,
  templateUrl: './home-header.html',
  styleUrl: './home-header.scss',
})
/**
 * Header component for the authenticated area.
 *
 * Responsibilities:
 * - groups persistent navigation and branding elements shared by home views.
 * - provides @ autocomplete user search against the registered user list.
 */
export class HomeHeader implements OnDestroy {
  private readonly auth        = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly postFilters = inject(PostFilterService);
  private readonly router      = inject(Router);

  searchQuery  = '';
  suggestions: PublicUser[] = [];
  showDropdown = false;
  currentUser: AuthUser | null = null;

  private readonly search$   = new Subject<string>();
  private readonly searchSub: Subscription;

  constructor() {
    this.currentUser = this.auth.getCurrentUser();
    this.searchSub = this.auth.user$.subscribe((user) => {
      this.currentUser = user;
    });

    this.searchSub.add(this.search$.pipe(
      debounceTime(150),
      distinctUntilChanged(),
    ).subscribe((query) => {
      const normalizedQuery = query.trim();
      if (!normalizedQuery.startsWith('@')) {
        this.postFilters.setQuery(normalizedQuery);
        this.suggestions = [];
        this.showDropdown = false;
        return;
      }

      this.postFilters.setQuery('');
      if (normalizedQuery.length < 2) {
        this.suggestions = [];
        this.showDropdown = false;
        return;
      }

      const lower = normalizedQuery.slice(1).toLowerCase();
      this.userService.getUsers().subscribe((users) => {
        this.suggestions = users
          .filter(
            (u) =>
              u.username?.toLowerCase().includes(lower) ||
              u.name?.toLowerCase().includes(lower),
          )
          .sort((a, b) => {
            const nameA = (a.username ?? a.name ?? '').toLowerCase();
            const nameB = (b.username ?? b.name ?? '').toLowerCase();
            return nameA.localeCompare(nameB);
          });
        this.showDropdown = this.suggestions.length > 0;
      });
    }));

    this.searchSub.add(
      this.postFilters.filters$.subscribe((filters) => {
        if (this.searchQuery.trim().startsWith('@')) {
          return;
        }

        if (this.searchQuery !== filters.query) {
          this.searchQuery = filters.query;
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.searchSub.unsubscribe();
  }

  onSearchInput(value: string): void {
    this.searchQuery = value;
    this.search$.next(value);
  }

  selectUser(user: PublicUser): void {
    const username = user.username?.trim() ?? '';

    this.searchQuery = '@' + ((username || user.name) ?? '');
    this.showDropdown = false;
    this.suggestions = [];
    this.postFilters.setQuery('');

    if (username) {
      this.router.navigate(['/profile', username]);
    }
  }

  closeDropdown(): void {
    setTimeout(() => {
      this.showDropdown = false;
    }, 150);
  }

  getUserInitials(user: PublicUser): string {
    const source = user.name ?? user.username ?? '';
    return source
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  }

  get initials(): string {
    const source = this.currentUser?.name ?? this.currentUser?.username ?? '';
    return source
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  }

  get avatarSafe(): string | null {
    const avatar = this.currentUser?.avatar ?? null;
    return this.isAllowedAvatarDataUrl(avatar) ? avatar : null;
  }

  private isAllowedAvatarDataUrl(value: string | null): value is string {
    return typeof value === 'string' && /^data:image\/(?:jpeg|jpg|png|gif|webp);base64,/i.test(value);
  }
}

import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { PostFilters, PostFilterService, PostFilterMatchMode } from '../../services/post-filter.service';

@Component({
  selector: 'app-home',
  standalone: false,
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
/**
 * Shell component for the authenticated home area.
 *
 * Responsibility:
 * - hosts the private layout and the child router outlet for feed and post
 *   creation views available after a successful login.
 * - delegates right-side recommendations to HomeRightAside component.
 * - keeps this container focused on composition, not feed analytics logic.
 */
export class Home implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly postFilters = inject(PostFilterService);

  private readonly subscriptions = new Subscription();
  private isSyncingFromUrl = false;

  ngOnInit(): void {
    this.subscriptions.add(
      this.route.queryParamMap.subscribe((queryParamMap) => {
        if (!this.isFeedRouteActive()) {
          return;
        }

        const parsedFilters = this.parseFiltersFromQueryParams({
          q: queryParamMap.get('q') ?? '',
          tags: queryParamMap.get('tags') ?? '',
          match: queryParamMap.get('match') ?? '',
          feed: queryParamMap.get('feed') ?? '',
        });

        if (this.areFiltersEqual(parsedFilters, this.postFilters.current)) {
          return;
        }

        this.isSyncingFromUrl = true;
        this.postFilters.replace(parsedFilters);
        this.isSyncingFromUrl = false;
      }),
    );

    this.subscriptions.add(
      this.postFilters.filters$.subscribe((filters) => {
        if (this.isSyncingFromUrl || !this.isFeedRouteActive()) {
          return;
        }

        const nextQueryParams = this.buildQueryParamsFromFilters(filters);
        if (this.areQueryParamsEqual(nextQueryParams, this.route.snapshot.queryParams)) {
          return;
        }

        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: nextQueryParams,
          replaceUrl: true,
        });
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private parseFiltersFromQueryParams(queryParams: Params): PostFilters {
    const query = String(queryParams['q'] ?? '').trim();
    const matchRaw = String(queryParams['match'] ?? '').trim().toLowerCase();
    const match: PostFilterMatchMode = matchRaw === 'all' ? 'all' : 'any';
    const feedRaw = String(queryParams['feed'] ?? '').trim().toLowerCase();
    const followOnly = feedRaw === 'following';
    const tagIds = String(queryParams['tags'] ?? '')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((id) => Number.isInteger(id) && id > 0);

    return {
      tagIds: Array.from(new Set(tagIds)),
      match,
      followOnly,
      query,
    };
  }

  private buildQueryParamsFromFilters(filters: PostFilters): Params {
    const queryParams: Params = {};

    if (filters.query !== '') {
      queryParams['q'] = filters.query;
    }

    if (filters.tagIds.length > 0) {
      queryParams['tags'] = filters.tagIds.join(',');
    }

    if (filters.match !== 'any') {
      queryParams['match'] = filters.match;
    }

    if (filters.followOnly) {
      queryParams['feed'] = 'following';
    }

    return queryParams;
  }

  private areFiltersEqual(a: PostFilters, b: PostFilters): boolean {
    if (a.query !== b.query || a.match !== b.match || a.followOnly !== b.followOnly) {
      return false;
    }

    if (a.tagIds.length !== b.tagIds.length) {
      return false;
    }

    return a.tagIds.every((id, index) => id === b.tagIds[index]);
  }

  private areQueryParamsEqual(a: Params, b: Params): boolean {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();

    if (aKeys.length !== bKeys.length) {
      return false;
    }

    return aKeys.every((key, index) => key === bKeys[index] && String(a[key]) === String(b[key]));
  }

  private isFeedRouteActive(): boolean {
    const currentPath = this.router.url.split('?')[0].split('#')[0];
    return currentPath === '/home' || currentPath === '/home/';
  }
}

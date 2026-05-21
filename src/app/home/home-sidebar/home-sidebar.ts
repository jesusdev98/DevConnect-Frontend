import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, HostListener, inject, OnDestroy, Renderer2, ViewChild } from '@angular/core';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  map,
  of,
  shareReplay,
  startWith,
} from 'rxjs';
import { PostFilterMatchMode, PostFilterService } from '../../services/post-filter.service';
import { TagCatalogService, TagCategory, TagOption } from '../../services/tag-catalog.service';

interface HomeSidebarViewModel {
  tagCategories: TagCategory[];
  selectedTagIds: Set<number>;
  selectedTagsSummary: TagOption[];
  activeFilterChips: ActiveFilterChip[];
  activeFilterOverflowCount: number;
  activeFiltersLabel: string;
  matchMode: PostFilterMatchMode;
  followOnly: boolean;
  isLoadingFilters: boolean;
  filterError: string;
}

interface ActiveFilterChip {
  kind: 'follow' | 'tag';
  id?: number;
  label: string;
}

@Component({
  selector: 'app-home-sidebar',
  standalone: false,
  templateUrl: './home-sidebar.html',
  styleUrl: './home-sidebar.scss',
})
/**
 * Sidebar para navegación secundaria y filtros del feed.
 */
export class HomeSidebar implements OnDestroy {
  private static readonly MAX_FILTER_TAGS = 15;
  private readonly tagCatalogService = inject(TagCatalogService);
  private readonly postFilterService = inject(PostFilterService);
  private readonly renderer = inject(Renderer2);
  private readonly document = inject(DOCUMENT);
  @ViewChild('premiumCloseButton') private premiumCloseButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('premiumTriggerButton') private premiumTriggerButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('premiumSoonConfirmButton') private premiumSoonConfirmButton?: ElementRef<HTMLButtonElement>;
  private previousBodyOverflow: string | null = null;
  isPremiumModalOpen = false;
  isPremiumSoonModalOpen = false;

  // Error exclusivamente de interacción (p.ej. superar el límite de selección).
  private readonly selectionErrorSubject = new BehaviorSubject<string>('');

  // Estado remoto del catálogo (loading/data/error) listo para combinar con filtros.
  private readonly catalogState$ = this.tagCatalogService.getTagCategories().pipe(
    map((categories) => ({
      tagCategories: categories,
      isLoadingFilters: false,
      catalogError: '',
    })),
    startWith({
      tagCategories: [] as TagCategory[],
      isLoadingFilters: !this.tagCatalogService.hasResolvedTagCatalogCache(),
      catalogError: '',
    }),
    catchError(() => of({
      tagCategories: [] as TagCategory[],
      isLoadingFilters: false,
      catalogError: 'No se pudo cargar el filtro de tags.',
    })),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  // ViewModel único del sidebar para que el template consuma todo con async pipe.
  readonly vm$ = combineLatest([
    this.catalogState$,
    this.postFilterService.filters$,
    this.selectionErrorSubject,
  ]).pipe(
    map(([catalogState, filters, selectionError]): HomeSidebarViewModel => {
      const selectedTagIds = new Set(filters.tagIds);
      const selectedTagsSummary = catalogState.tagCategories
        .flatMap((category) => category.tags)
        .filter((tag) => selectedTagIds.has(tag.id));
      const activeFilterCount = selectedTagIds.size + (filters.followOnly ? 1 : 0);
      const activeFilterChips: ActiveFilterChip[] = [
        ...(filters.followOnly
          ? [{ kind: 'follow' as const, label: 'Sólo autores que sigo' }]
          : []),
        ...selectedTagsSummary.map((tag) => ({
          kind: 'tag' as const,
          id: tag.id,
          label: tag.name,
        })),
      ];
      const visibleActiveFilterChips = activeFilterChips.slice(0, 3);

      return {
        tagCategories: catalogState.tagCategories,
        selectedTagIds,
        selectedTagsSummary,
        activeFilterChips: visibleActiveFilterChips,
        activeFilterOverflowCount: Math.max(0, activeFilterChips.length - visibleActiveFilterChips.length),
        activeFiltersLabel: activeFilterCount === 0
          ? 'Sin filtros activos'
          : `${activeFilterCount} activo${activeFilterCount === 1 ? '' : 's'}`,
        matchMode: filters.match,
        followOnly: filters.followOnly,
        isLoadingFilters: catalogState.isLoadingFilters,
        filterError: selectionError || catalogState.catalogError,
      };
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  getCategoryLabel(name: string): string {
    return name === 'TipoContenido' ? 'Tipo de contenido' : name;
  }

  getCategorySelectedCount(category: TagCategory, selectedTagIds: Set<number>): number {
    return category.tags.reduce((count, tag) => count + (selectedTagIds.has(tag.id) ? 1 : 0), 0);
  }

  getCategorySelectedSummary(category: TagCategory, selectedTagIds: Set<number>): string {
    const selectedNames = category.tags
      .filter((tag) => selectedTagIds.has(tag.id))
      .map((tag) => tag.name);

    if (selectedNames.length === 0) {
      return '';
    }

    if (selectedNames.length === 1) {
      return selectedNames[0];
    }

    const [firstSelected, ...restSelected] = selectedNames;
    return `${firstSelected} +${restSelected.length}`;
  }

  shouldOpenCategory(category: TagCategory, selectedTagIds: Set<number>): boolean {
    return this.getCategorySelectedCount(category, selectedTagIds) > 0;
  }

  // Mantiene primero los tags seleccionados para mejorar escaneabilidad visual.
  getCategoryTags(category: TagCategory, selectedTagIds: Set<number>): TagOption[] {
    const selected: TagOption[] = [];
    const unselected: TagOption[] = [];

    // UX: mostrar primero los tags ya activos en cada categoría.
    category.tags.forEach((tag) => {
      if (selectedTagIds.has(tag.id)) {
        selected.push(tag);
        return;
      }

      unselected.push(tag);
    });

    return [...selected, ...unselected];
  }

  /**
   * Actualiza tags seleccionados y notifica al feed.
   */
  onTagToggle(tagId: number, selectedTagIds: Set<number>): void {
    // Clonamos para no mutar el Set que viene del vm del template.
    const nextSelectedTagIds = new Set(selectedTagIds);

    if (nextSelectedTagIds.has(tagId)) {
      nextSelectedTagIds.delete(tagId);
      this.selectionErrorSubject.next('');
      this.publishTagFilters(nextSelectedTagIds);
      return;
    }

    if (nextSelectedTagIds.size >= HomeSidebar.MAX_FILTER_TAGS) {
      this.selectionErrorSubject.next(
        `Se permiten como maximo ${HomeSidebar.MAX_FILTER_TAGS} tags en el filtro.`,
      );
      return;
    }

    this.selectionErrorSubject.next('');
    nextSelectedTagIds.add(tagId);
    this.publishTagFilters(nextSelectedTagIds);
  }

  removeSelectedTag(tagId: number, selectedTagIds: Set<number>): void {
    if (!selectedTagIds.has(tagId)) {
      return;
    }

    const nextSelectedTagIds = new Set(selectedTagIds);
    nextSelectedTagIds.delete(tagId);
    this.selectionErrorSubject.next('');
    this.publishTagFilters(nextSelectedTagIds);
  }

  /**
   * Cambia modo de coincidencia (any/all) y notifica al feed.
   */
  setMatchMode(mode: PostFilterMatchMode): void {
    this.selectionErrorSubject.next('');
    this.postFilterService.setMatch(mode);
  }

  setFollowOnly(enabled: boolean): void {
    this.selectionErrorSubject.next('');
    this.postFilterService.setFollowOnly(enabled);
  }

  /**
   * Limpia toda la selección de filtros.
   */
  clearFilters(): void {
    this.selectionErrorSubject.next('');
    this.postFilterService.clear();
  }

  openPremiumModal(): void {
    if (this.isPremiumModalOpen) {
      return;
    }

    this.isPremiumModalOpen = true;
    this.lockBodyScroll();
    setTimeout(() => this.premiumCloseButton?.nativeElement.focus());
  }

  closePremiumModal(restoreFocus = true, unlockScroll = true): void {
    if (!this.isPremiumModalOpen) {
      return;
    }

    this.isPremiumModalOpen = false;
    if (unlockScroll) {
      this.unlockBodyScroll();
    }

    if (restoreFocus) {
      setTimeout(() => this.premiumTriggerButton?.nativeElement.focus());
    }
  }

  openPremiumSoonModal(): void {
    if (this.isPremiumSoonModalOpen) {
      return;
    }

    this.closePremiumModal(false, false);
    this.isPremiumSoonModalOpen = true;
    this.lockBodyScroll();
    setTimeout(() => this.premiumSoonConfirmButton?.nativeElement.focus());
  }

  closePremiumSoonModal(restoreFocus = true): void {
    if (!this.isPremiumSoonModalOpen) {
      return;
    }

    this.isPremiumSoonModalOpen = false;
    this.unlockBodyScroll();

    if (restoreFocus) {
      setTimeout(() => this.premiumTriggerButton?.nativeElement.focus());
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isPremiumSoonModalOpen) {
      this.closePremiumSoonModal();
      return;
    }

    if (!this.isPremiumModalOpen) {
      return;
    }

    this.closePremiumModal();
  }

  ngOnDestroy(): void {
    this.unlockBodyScroll();
  }

  /**
   * Publica los tags seleccionados al estado compartido de filtros.
   */
  private publishTagFilters(selectedTagIds: Set<number>): void {
    // El estado compartido viaja normalizado como array para PostFilterService.
    this.postFilterService.setTagIds(Array.from(selectedTagIds.values()));
  }

  private lockBodyScroll(): void {
    if (this.previousBodyOverflow !== null) {
      return;
    }

    this.previousBodyOverflow = this.document.body.style.overflow;
    this.renderer.setStyle(this.document.body, 'overflow', 'hidden');
  }

  private unlockBodyScroll(): void {
    if (this.previousBodyOverflow === null) {
      return;
    }

    if (this.previousBodyOverflow) {
      this.renderer.setStyle(this.document.body, 'overflow', this.previousBodyOverflow);
    } else {
      this.renderer.removeStyle(this.document.body, 'overflow');
    }

    this.previousBodyOverflow = null;
  }
}

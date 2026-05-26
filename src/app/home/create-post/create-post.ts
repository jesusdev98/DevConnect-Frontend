import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Post, PostService } from '../../services/post-service';
import { TagCatalogService, TagCategory } from '../../services/tag-catalog.service';

@Component({
  selector: 'app-create-post',
  standalone: false,
  templateUrl: './create-post.html',
  styleUrl: './create-post.scss',
})
/**
 * Gestiona la creación de publicaciones dentro del área autenticada.
 *
 * Responsabilidades:
 * - mantiene el formulario reactivo del post.
 * - carga los tags disponibles agrupados por categoría.
 * - coordina la navegación de vuelta al feed tras guardar.
 */
export class CreatePost implements OnInit {
  private static readonly MAX_TAGS = 15;
  private static readonly MAX_CONTENT_LENGTH = 1500;
  private static readonly CONTENT_MAX_ERROR = 'maxlength';

  form: FormGroup;
  isSubmitting = false;
  isLoadingPost = false;
  isLoadingTags = false;
  errorMsg = '';
  tagCategories: TagCategory[] = [];
  isEditMode = false;
  editPostId: number | null = null;
  private editOrigin: 'home' | 'detail' | 'profile' = 'detail';
  private editFromProfileRoute: string | null = null;
  private editPostSnapshot: Post | null = null;
  readonly maxContentLength = CreatePost.MAX_CONTENT_LENGTH;
  // Guardamos IDs en Set para evitar duplicados de forma natural.
  selectedTagIds = new Set<number>();

  // Inyectamos dependencias y creamos el formulario reactivo.
  constructor(
    private fb: FormBuilder,
    private postsService: PostService,
    private tagCatalogService: TagCatalogService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {
    this.form = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(5)]],
      content: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(CreatePost.MAX_CONTENT_LENGTH)]],
    });
  }

  ngOnInit(): void {
    const postIdParam = this.route.snapshot.paramMap.get('id');
    const normalizedPostId = Number(postIdParam);
    this.isEditMode = Number.isFinite(normalizedPostId) && normalizedPostId > 0;
    this.editPostId = this.isEditMode ? normalizedPostId : null;
    this.hydrateEditNavigationContext();

    // Carga inicial del catálogo de tags (categorías + tags).
    this.loadTagCategories();

    if (this.isEditMode && this.editPostId !== null) {
      this.prefillFromNavigationSnapshot(this.editPostId);
      this.loadPostForEdit(this.editPostId);
    } else {
      // Si venimos con ?content= en la URL, rellenamos el contenido del post.
      const content = this.route.snapshot.queryParamMap.get('content')?.trim();
      if (content) {
        this.form.patchValue({ content });
      }
    }
  }

  /**
   * Valida y envía el payload del post en memoria.
   *
   * Efectos:
   * - marca controles como touched cuando el formulario es inválido.
   * - guarda el nuevo post mediante PostService.
   * - redirige a /home en caso de éxito.
   */
  onSubmit(): void {
    this.errorMsg = '';
    const title = this.form.value.title;
    const content = typeof this.form.value.content === 'string' ? this.form.value.content : '';

    // Si hay errores de validación, mostramos mensajes y paramos.
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isContentTooLong(content)) {
      this.form.get('content')?.setErrors({
        [CreatePost.CONTENT_MAX_ERROR]: {
          requiredLength: CreatePost.MAX_CONTENT_LENGTH,
          actualLength: content.length,
        },
      });
      this.form.get('content')?.markAsTouched();
      this.errorMsg = `El contenido no puede superar ${CreatePost.MAX_CONTENT_LENGTH} caracteres.`;
      this.refreshView();
      return;
    }

    // Convertimos la seleccion actual a array de IDs para la API.
    const tagIds = Array.from(this.selectedTagIds.values());
    if (tagIds.length > CreatePost.MAX_TAGS) {
      this.errorMsg = `Se permiten como maximo ${CreatePost.MAX_TAGS} tags.`;
      return;
    }

    // Marcamos submit en curso para evitar envíos duplicados.
    this.isSubmitting = true;

   // Llamada al servicio: éxito -> volvemos a home, error -> mensaje en UI.
    const request$ = this.isEditMode && this.editPostId !== null
      ? this.postsService.updatePost(this.editPostId, title, content, tagIds)
      : this.postsService.createPost(title, content, tagIds);

    request$.subscribe({
      next: (savedPost) => {
        this.isSubmitting = false;
        if (this.isEditMode && this.editPostId !== null) {
          this.navigateAfterEdit(savedPost);
          return;
        }

        this.router.navigate(['/home']);
      },
      error: (error: unknown) => {
        // Feedback inmediato en la misma vista.
        this.isSubmitting = false;
        this.errorMsg = this.resolveSubmitErrorMessage(error);
        this.refreshView();
      },
    });
  }

  /**
   * Helper de template: indica si un tag está actualmente seleccionado.
   */
  isTagSelected(tagId: number): boolean {
    return this.selectedTagIds.has(tagId);
  }

  getSelectedCountForCategory(category: TagCategory): number {
    return category.tags.reduce((acc, tag) => (this.selectedTagIds.has(tag.id) ? acc + 1 : acc), 0);
  }

  /**
   * Maneja el toggle de checkboxes de tags.
   */
  onTagToggle(tagId: number, event: Event): void {
    const checked = (event.target as HTMLInputElement | null)?.checked ?? false;

    if (!checked) {
      this.selectedTagIds.delete(tagId);
      return;
    }

    if (this.selectedTagIds.size >= CreatePost.MAX_TAGS) {
      this.errorMsg = `Se permiten como maximo ${CreatePost.MAX_TAGS} tags.`;
      return;
    }

    this.errorMsg = '';
    this.selectedTagIds.add(tagId);
  }

  /**
   * Se muestra en UI para feedback rápido de cantidad seleccionada.
   */
  get selectedTagsCount(): number {
    return this.selectedTagIds.size;
  }

  get submitLabel(): string {
    if (this.isSubmitting) {
      return this.isEditMode ? 'Guardando...' : 'Publicando...';
    }

    return this.isEditMode ? 'Guardar cambios' : 'Publicar';
  }

  get pageTitle(): string {
    return this.isEditMode ? 'Editar publicación' : 'Nueva publicación';
  }

  get cancelRoute(): Array<string | number> {
    return this.resolvePostEditReturnTarget();
  }

  onContentInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement | null)?.value ?? '';
    if (!this.isContentTooLong(value)) {
      return;
    }

    this.form.get('content')?.setErrors({
      [CreatePost.CONTENT_MAX_ERROR]: {
        requiredLength: CreatePost.MAX_CONTENT_LENGTH,
        actualLength: value.length,
      },
    });
  }

  /**
   * Obtiene categorías y tags desde el catálogo del backend.
   */
  private loadTagCategories(): void {
    this.isLoadingTags = true;
    this.errorMsg = '';

    this.tagCatalogService.getTagCategories().subscribe({
      next: (categories) => {
        this.tagCategories = Array.isArray(categories) ? categories : [];
        this.isLoadingTags = false;
      },
      error: () => {
        this.tagCategories = [];
        this.isLoadingTags = false;
        this.errorMsg = 'No se pudo cargar el catalogo de tags. Verifica que el backend esta disponible.';
      },
    });
  }

  /**
   * Traduce errores del backend a mensajes legibles para la UI.
   */
  private resolveSubmitErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return this.isEditMode ? 'No se pudo actualizar la publicación.' : 'No se pudo crear la publicación.';
    }

    const validationErrors = error.error?.errors;
    if (validationErrors && typeof validationErrors === 'object') {
      const firstField = Object.keys(validationErrors)[0];
      const firstMessage = Array.isArray(validationErrors[firstField]) ? validationErrors[firstField][0] : null;
      if (typeof firstMessage === 'string' && firstMessage.trim() !== '') {
        return firstMessage;
      }
    }

    return this.isEditMode ? 'No se pudo actualizar la publicación.' : 'No se pudo crear la publicación.';
  }

  /**
   * Repintado puntual para feedback inmediato en la misma vista (422).
   */
  private refreshView(): void {
    this.cdr.detectChanges();
  }

  private isContentTooLong(content: string): boolean {
    return content.length > CreatePost.MAX_CONTENT_LENGTH;
  }

  private loadPostForEdit(postId: number): void {
    this.isLoadingPost = true;
    this.errorMsg = '';

    this.postsService.getPostById(postId).subscribe({
      next: (post) => {
        this.editPostSnapshot = post;
        this.form.patchValue({
          title: post.title,
          content: post.content,
        });
        this.selectedTagIds = new Set(post.tagIds);
        this.isLoadingPost = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingPost = false;
        this.errorMsg = 'No se pudo cargar la publicación para editar.';
        this.cdr.detectChanges();
      },
    });
  }

  private prefillFromNavigationSnapshot(postId: number): void {
    const statePost = this.resolveNavigationSnapshotPost(postId);
    if (!statePost) {
      return;
    }

    this.form.patchValue({
      title: statePost.title,
      content: statePost.content,
    });
    this.editPostSnapshot = statePost;
    this.selectedTagIds = new Set(statePost.tagIds);
  }

  cancelEdit(): void {
    if (this.isEditMode && this.editPostId !== null) {
      this.navigateAfterEdit(this.editPostSnapshot);
      return;
    }

    this.router.navigate(['/home']);
  }

  private resolveNavigationSnapshotPost(postId: number): Post | null {
    const historyPost = this.toPostSnapshot(history.state?.postSnapshot, postId);
    if (historyPost) {
      return historyPost;
    }

    const navPost = this.toPostSnapshot(this.router.getCurrentNavigation()?.extras?.state?.['postSnapshot'], postId);
    return navPost;
  }

  private hydrateEditNavigationContext(): void {
    if (!this.isEditMode) {
      this.editOrigin = 'detail';
      this.editFromProfileRoute = null;
      return;
    }

    const navState = this.router.getCurrentNavigation()?.extras?.state as Record<string, unknown> | undefined;
    const historyState = (history.state ?? {}) as Record<string, unknown>;
    const stateOrigin = navState?.['editOrigin'] ?? historyState['editOrigin'];
    const stateFromProfile = navState?.['fromProfile'] ?? historyState['fromProfile'];

    this.editOrigin = this.normalizeEditOrigin(stateOrigin);
    this.editFromProfileRoute = this.normalizeProfileRoute(stateFromProfile);
  }

  private normalizeEditOrigin(value: unknown): 'home' | 'detail' | 'profile' {
    if (value === 'home' || value === 'detail' || value === 'profile') {
      return value;
    }

    return 'detail';
  }

  private normalizeProfileRoute(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const route = value.trim();
    if (route === '/profile' || route.startsWith('/profile/')) {
      return route;
    }

    return null;
  }

  private resolvePostEditReturnTarget(): Array<string | number> {
    if (!this.isEditMode) {
      return ['/home'];
    }

    if (this.editOrigin === 'home') {
      return ['/home'];
    }

    if (this.editOrigin === 'profile') {
      return [this.editFromProfileRoute ?? '/profile'];
    }

    return this.editPostId !== null ? ['/home/post', this.editPostId] : ['/home'];
  }

  private navigateAfterEdit(postSnapshot?: Post | null): void {
    const target = this.resolvePostEditReturnTarget();
    if (target.length === 2 && target[0] === '/home/post' && this.editPostId !== null) {
      const snapshot = postSnapshot ?? this.editPostSnapshot;
      const extras = snapshot ? { state: { postSnapshot: snapshot } } : undefined;
      this.router.navigate(['/home/post', this.editPostId], extras);
      return;
    }

    if (this.editOrigin === 'home' && target.length === 1 && target[0] === '/home') {
      this.router.navigate(['/home'], { queryParamsHandling: 'preserve' });
      return;
    }

    this.router.navigate(target);
  }

  private toPostSnapshot(value: unknown, postId: number): Post | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const raw = value as Record<string, unknown>;
    const id = Number(raw['id']);
    if (!Number.isFinite(id) || id <= 0 || id !== postId) {
      return null;
    }

    const tags = Array.isArray(raw['tags'])
      ? raw['tags'].filter((tag): tag is string => typeof tag === 'string')
      : [];

    const tagIds = Array.isArray(raw['tagIds'])
      ? raw['tagIds']
        .map((tagId) => Number(tagId))
        .filter((tagId) => Number.isFinite(tagId) && tagId > 0)
      : [];

    const rawAuthor = raw['author'];
    const author = rawAuthor && typeof rawAuthor === 'object'
      ? {
          id: Number((rawAuthor as Record<string, unknown>)['id']) || 0,
          name: typeof (rawAuthor as Record<string, unknown>)['name'] === 'string'
            ? (rawAuthor as Record<string, unknown>)['name'] as string
            : undefined,
          username: typeof (rawAuthor as Record<string, unknown>)['username'] === 'string'
            ? (rawAuthor as Record<string, unknown>)['username'] as string
            : undefined,
        }
      : null;

    return {
      id,
      title: typeof raw['title'] === 'string' ? raw['title'] : '',
      content: typeof raw['content'] === 'string' ? raw['content'] : '',
      tags,
      tagIds,
      createdAt: typeof raw['createdAt'] === 'string' ? raw['createdAt'] : '',
      commentsCount: Number(raw['commentsCount']) >= 0 ? Number(raw['commentsCount']) : 0,
      likesCount: Number(raw['likesCount']) >= 0 ? Number(raw['likesCount']) : 0,
      isPinned: Boolean(raw['isPinned'] ?? raw['is_pinned']),
      likedByCurrentUser: Boolean(raw['likedByCurrentUser']),
      isSaved: Boolean(raw['isSaved'] ?? raw['is_saved']),
      author,
    };
  }
}

import { AfterViewInit, ChangeDetectorRef, Component, DestroyRef, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CommentService, PostComment } from '../../services/comment.service';
import { LikeService } from '../../services/like.service';
import { PostFilterService } from '../../services/post-filter.service';
import { Post, PostService } from '../../services/post-service';
import { UiFeedbackService } from '../../services/ui-feedback.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-post-list',
  standalone: false,
  templateUrl: './post-list.html',
  styleUrl: './post-list.scss',
})
/**
 * Obtiene y renderiza la lista actual de publicaciones del feed.
 */
export class PostList {
  private readonly postService       = inject(PostService);
  private readonly postFilterService = inject(PostFilterService);
  private readonly commentService    = inject(CommentService);
  private readonly authService       = inject(AuthService);
  private readonly likeService       = inject(LikeService);
  private readonly feedback          = inject(UiFeedbackService);
  private readonly cdr               = inject(ChangeDetectorRef);
  private readonly router            = inject(Router);
  private readonly destroyRef        = inject(DestroyRef);

  @ViewChild('loadMoreSentinel') private loadMoreSentinel?: ElementRef<HTMLDivElement>;

  private intersectionObserver: IntersectionObserver | null = null;
  private currentFilters = this.postFilterService.current;
  private currentPage = 0;

  openedCommentsPostId: number | null = null;
  private readonly activeReplyCommentIdByPost = new Map<number, number>();
  private readonly activeEditCommentIdByPost = new Map<number, number>();
  private readonly savingPostIds = new Set<number>();
  posts: Post[] = [];
  hasActiveFilters = false;
  emptyFilteredMessage = 'No hay resultados con los filtros actuales.';
  isLoadingPosts = false;
  hasMorePosts = true;

  confirmDeleteOpen = false;
  confirmDeleteTitle = '';
  confirmDeleteMessage = '';
  private pendingDeleteAction: (() => void) | null = null;

  private readonly commentsMap = new Map<number, PostComment[]>();

  /**
   * Escucha filtros y carga la primera página del feed.
   * El sentinel del final seguirá pidiendo más páginas cuando haga falta.
   */
  ngOnInit(): void {
    this.postFilterService.filters$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((filters) => {
        this.currentFilters = filters;
        this.resetFeed();
        this.loadNextPage();
      });
  }

  ngAfterViewInit(): void {
    this.setupIntersectionObserver();
  }

  ngOnDestroy(): void {
    this.intersectionObserver?.disconnect();
  }

  private getCurrentUserId(): number | null {
    return this.authService.getCurrentUser()?.id ?? null;
  }

  // Reinicia el feed cuando cambian los filtros del sidebar.
  private resetFeed(): void {
    this.posts = [];
    this.currentPage = 0;
    this.hasMorePosts = true;
    this.isLoadingPosts = false;
    this.hasActiveFilters = this.currentFilters.tagIds.length > 0 || this.currentFilters.followOnly || this.currentFilters.query.trim() !== '';
    this.emptyFilteredMessage = this.currentFilters.followOnly
      ? (this.currentFilters.tagIds.length > 0
        ? 'No hay publicaciones de usuarios seguidos con los filtros actuales.'
        : 'No hay publicaciones de usuarios seguidos.')
      : 'No hay resultados con los filtros actuales.';
  }

  // Pide la siguiente página y la concatena al feed actual.
  private loadNextPage(): void {
    if (this.isLoadingPosts || !this.hasMorePosts) {
      return;
    }

    this.isLoadingPosts = true;
    const nextPage = this.currentPage + 1;

    this.postService.getPostsPage(this.currentFilters, nextPage).subscribe({
      next: (page) => {
        this.likeService.hydratePosts(page.posts);
        this.posts = [...this.posts, ...page.posts];
        this.currentPage = page.currentPage;
        this.hasMorePosts = page.hasMore;
        this.isLoadingPosts = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingPosts = false;
        this.hasMorePosts = false;
        this.cdr.detectChanges();
      },
    });
  }

  // Observa el sentinel del final para disparar más cargas.
  private setupIntersectionObserver(): void {
    if (this.intersectionObserver || typeof IntersectionObserver === 'undefined') {
      return;
    }

    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.loadNextPage();
        }
      },
      {
        root: null,
        rootMargin: '200px',
        threshold: 0.1,
      },
    );

    if (this.loadMoreSentinel?.nativeElement) {
      this.intersectionObserver.observe(this.loadMoreSentinel.nativeElement);
    }
  }

  // Abre o cierra comentarios de un post.
  toggleComments(postId: number): void {
    const isOpening = this.openedCommentsPostId !== postId;
    this.openedCommentsPostId = isOpening ? postId : null;
    if (!isOpening) {
      this.activeReplyCommentIdByPost.delete(postId);
      this.activeEditCommentIdByPost.delete(postId);
    }

    if (isOpening && !this.commentsMap.has(postId)) {
      this.loadCommentsForPost(postId);
    }
  }

  isCommentsOpen(postId: number): boolean {
    return this.openedCommentsPostId === postId;
  }

  getComments(postId: number): PostComment[] {
    return this.commentsMap.get(postId) ?? [];
  }

  getVisibleCommentCount(postId: number): number {
    return this.flattenCommentTree(this.getComments(postId)).length;
  }

  // Reacciones de likes sobre el post.
  togglePostLike(postId: number): void {
    const userId = this.getCurrentUserId();
    if (!userId) return;

    const wasLiked = this.hasLikedPost(postId);
    // El servicio aplica update optimista + reconciliación/rollback con backend.
    this.likeService.togglePostLike(postId);
    this.feedback.info(wasLiked ? 'Has quitado tu me gusta de la publicación.' : 'Has marcado me gusta en la publicación.');
  }

  getPostLikeCount(postId: number): number {
    return this.likeService.getPostLikeCount(postId);
  }

  hasLikedPost(postId: number): boolean {
    const userId = this.getCurrentUserId();
    return userId ? this.likeService.hasLikedPost(postId) : false;
  }

  toggleCommentLike(commentId: number): void {
    const userId = this.getCurrentUserId();
    if (!userId) return;

    const wasLiked = this.hasLikedComment(commentId);
    // El servicio aplica update optimista + reconciliación/rollback con backend.
    this.likeService.toggleCommentLike(commentId);
    this.feedback.info(wasLiked ? 'Has quitado tu me gusta del comentario.' : 'Has marcado me gusta en el comentario.');
  }

  getCommentLikeCount(commentId: number): number {
    return this.likeService.getCommentLikeCount(commentId);
  }

  hasLikedComment(commentId: number): boolean {
    const userId = this.getCurrentUserId();
    return userId ? this.likeService.hasLikedComment(commentId) : false;
  }

  getPostLikeAriaLabel(postId: number): string {
    return this.hasLikedPost(postId) ? 'Quitar me gusta de la publicación' : 'Marcar me gusta en la publicación';
  }

  getCommentLikeAriaLabel(commentId: number): string {
    return this.hasLikedComment(commentId) ? 'Quitar me gusta del comentario' : 'Marcar me gusta en el comentario';
  }
  // Navegación a detalle o edición del post.
  openPostDetail(post: Post): void {
    const normalizedPostId = Number(post?.id);
    if (!Number.isFinite(normalizedPostId) || normalizedPostId <= 0) {
      return;
    }

    this.router.navigate(
      ['/home/post', normalizedPostId],
      {
        state: { postSnapshot: post },
        queryParamsHandling: 'preserve',
      },
    );
  }

  openEditPost(post: Post): void {
    const normalizedPostId = Number(post?.id);
    if (!Number.isFinite(normalizedPostId) || normalizedPostId <= 0) {
      return;
    }

    this.router.navigate(['/home/edit-post', normalizedPostId], {
      state: {
        postSnapshot: post,
        editOrigin: 'home',
      },
      queryParamsHandling: 'preserve',
    });
  }

  // Guardado local con sincronización al backend.
  canToggleSavePost(): boolean {
    return Boolean(this.getCurrentUserId());
  }

  isSavingPost(postId: number): boolean {
    return this.savingPostIds.has(postId);
  }

  getSavePostAriaLabel(post: Post): string {
    return post.isSaved ? 'Quitar publicación de guardados' : 'Guardar publicación';
  }

  toggleSavePost(post: Post): void {
    const postId = Number(post?.id);
    if (!this.canToggleSavePost() || !Number.isFinite(postId) || postId <= 0 || this.isSavingPost(postId)) {
      return;
    }

    this.savingPostIds.add(postId);
    const request$ = post.isSaved ? this.postService.unsavePost(postId) : this.postService.savePost(postId);

    request$.subscribe({
      next: (updatedPost) => {
        post.isSaved = updatedPost.isSaved;
        this.savingPostIds.delete(postId);
        this.cdr.detectChanges();
      },
      error: () => {
        this.savingPostIds.delete(postId);
        this.feedback.error('No se pudo actualizar el guardado de la publicación.');
        this.cdr.detectChanges();
      },
    });
  }

  canTogglePinPost(): boolean {
    return this.authService.getCurrentUser()?.role === 'admin';
  }

  canTogglePinComment(comment: PostComment): boolean {
    return this.authService.getCurrentUser()?.role === 'admin' && comment.parentId === null;
  }

  togglePostPin(post: Post): void {
    this.postService.toggleAdminPin(post.id).subscribe({
      next: (result) => {
        post.isPinned = result.isPinned;
        this.feedback.success(result.isPinned ? 'Publicación fijada correctamente.' : 'Publicación desfijada correctamente.');
        this.resetFeed();
        this.loadNextPage();
      },
      error: () => {
        this.feedback.error('No se pudo actualizar el estado de fijado de la publicación.');
        this.cdr.detectChanges();
      },
    });
  }

  toggleCommentPin(post: Post, comment: PostComment): void {
    this.commentService.toggleAdminPin(comment.id).subscribe({
      next: (result) => {
        this.feedback.success(result.isPinned ? 'Comentario fijado correctamente.' : 'Comentario desfijado correctamente.');
        this.loadCommentsForPost(post.id);
      },
      error: () => {
        this.feedback.error('No se pudo actualizar el estado de fijado del comentario.');
        this.cdr.detectChanges();
      },
    });
  }

  // Añade un comentario nuevo al hilo del post.
  addComment(postId: number, textarea: HTMLTextAreaElement, post: Post): void {
    const text = textarea.value.trim();
    if (text === '') return;

    this.commentService.addComment(postId, text).subscribe((comment) => {
      const current = this.commentsMap.get(postId) ?? [];
      const rootComment: PostComment = {
        ...comment,
        isPinned: comment.isPinned ?? false,
        parentId: comment.parentId ?? null,
        replies: [],
      };
      this.commentsMap.set(postId, [...current, rootComment]);
      this.likeService.hydrateComments([comment]);
      post.commentsCount++;
      textarea.value = '';
      this.cdr.detectChanges();
    });
  }

  // Activa el formulario de respuesta para ese comentario.
  openReplyForm(postId: number, commentId: number): void {
    this.cancelEditComment(postId);
    this.activeReplyCommentIdByPost.set(postId, commentId);
  }

  closeReplyForm(postId: number): void {
    this.activeReplyCommentIdByPost.delete(postId);
  }

  isReplyFormOpen(postId: number, commentId: number): boolean {
    return this.activeReplyCommentIdByPost.get(postId) === commentId;
  }

  openEditComment(postId: number, commentId: number): void {
    this.closeReplyForm(postId);
    this.activeEditCommentIdByPost.set(postId, commentId);
  }

  cancelEditComment(postId: number): void {
    this.activeEditCommentIdByPost.delete(postId);
  }

  isEditFormOpen(postId: number, commentId: number): boolean {
    return this.activeEditCommentIdByPost.get(postId) === commentId;
  }

  // Guarda un comentario editado y refresca su árbol.
  saveEditedComment(post: Post, comment: PostComment, textarea: HTMLTextAreaElement): void {
    const text = textarea.value.trim();
    if (text === '') {
      return;
    }

    this.commentService.updateComment(comment.id, text).subscribe({
      next: () => {
        this.cancelEditComment(post.id);
        this.loadCommentsForPost(post.id);
        this.feedback.success('Comentario actualizado correctamente.');
      },
      error: () => {
        this.feedback.error('No se pudo actualizar el comentario.');
        this.cdr.detectChanges();
      },
    });
  }

  submitReply(post: Post, parentComment: PostComment, textarea: HTMLTextAreaElement): void {
    const text = textarea.value.trim();
    if (text === '') {
      return;
    }

    this.commentService.addComment(post.id, text, parentComment.id).subscribe({
      next: () => {
        textarea.value = '';
        this.closeReplyForm(post.id);
        this.loadCommentsForPost(post.id);
      },
      error: () => {
        this.feedback.error('No se pudo enviar la respuesta.');
        this.cdr.detectChanges();
      },
    });
  }

  // Pide confirmación antes de eliminar un post.
  requestDeletePost(postId: number): void {
    this.openConfirmDelete(
      'Eliminar publicación',
      'Esta acción no se puede deshacer. ¿Quieres continuar?',
      () => this.deletePost(postId),
    );
  }

  // Borra el post y limpia el estado local asociado.
  private deletePost(postId: number): void {
    this.postService.deletePost(postId).subscribe({
      next: () => {
        this.posts = this.posts.filter(
          (post) => Number(post.id) !== Number(postId),
        );
        this.likeService.removePost(postId);
        this.commentsMap.delete(postId);
        if (this.openedCommentsPostId === postId) {
          this.openedCommentsPostId = null;
        }
        this.feedback.success('Publicación eliminada correctamente.');
        this.cdr.detectChanges();
      },
      error: () => {
        this.feedback.error('No se pudo eliminar la publicación.');
      },
    });
  }

  canDeletePost(post: Post): boolean {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) return false;

    const isAdmin = currentUser.role === 'admin';
    const isAuthor = Number(post.author?.id) === Number(currentUser.id);

    return isAdmin || isAuthor;
  }

  canEditPost(post: Post): boolean {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) return false;

    const isAuthor = Number(post.author?.id) === Number(currentUser.id);

    return isAuthor;
  }

  canEditComment(comment: PostComment): boolean {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) return false;

    const isAuthor = Number(comment.userId) === Number(currentUser.id);

    return isAuthor;
  }

  canDeleteComment(comment: PostComment): boolean {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) return false;

    const isAdmin = currentUser.role === 'admin';
    const isAuthor = Number(comment.userId) === Number(currentUser.id);

    return isAdmin || isAuthor;
  }

  // Pide confirmación antes de eliminar un comentario.
  requestDeleteComment(postId: number, commentId: number, post: Post): void {
    this.openConfirmDelete(
      'Eliminar comentario',
      'Esta acción no se puede deshacer. ¿Quieres continuar?',
      () => this.deleteComment(postId, commentId, post),
    );
  }

  // Borra el comentario y mantiene consistente el árbol local.
  private deleteComment(postId: number, commentId: number, post: Post): void {
    this.commentService.deleteComment(commentId).subscribe({
      next: () => {
        const currentComments = this.getComments(postId);
        const wasRootComment = currentComments.some(
          (comment) => Number(comment.id) === Number(commentId),
        );
        const nextComments = currentComments
          .filter((comment) => Number(comment.id) !== Number(commentId))
          .map((comment) => ({
            ...comment,
            replies: (comment.replies ?? []).filter((reply) => Number(reply.id) !== Number(commentId)),
          }));
        this.commentsMap.set(postId, nextComments);
        this.likeService.removeComment(commentId);
        this.activeEditCommentIdByPost.forEach((activeCommentId, key) => {
          if (Number(activeCommentId) === Number(commentId)) {
            this.activeEditCommentIdByPost.delete(key);
          }
        });
        if (wasRootComment && post.commentsCount > 0) {
          post.commentsCount--;
        }
        this.feedback.success('Comentario eliminado correctamente.');
        this.cdr.detectChanges();
      },
      error: () => {
        this.feedback.error('No se pudo eliminar el comentario.');
      },
    });
  }

  // Cierra el modal de borrado y ejecuta la acción pendiente.
  confirmDelete(): void {
    const action = this.pendingDeleteAction;
    this.closeConfirmDelete();
    action?.();
  }

  closeConfirmDelete(): void {
    this.confirmDeleteOpen = false;
    this.confirmDeleteTitle = '';
    this.confirmDeleteMessage = '';
    this.pendingDeleteAction = null;
  }

  private openConfirmDelete(title: string, message: string, action: () => void): void {
    this.confirmDeleteTitle = title;
    this.confirmDeleteMessage = message;
    this.pendingDeleteAction = action;
    this.confirmDeleteOpen = true;
  }

  // Carga comentarios solo cuando el usuario abre el post.
  private loadCommentsForPost(postId: number): void {
    this.commentService.loadCommentTree(postId).subscribe((comments) => {
      this.commentsMap.set(postId, [...comments]);
      this.likeService.hydrateComments(this.flattenCommentTree(comments));
      this.cdr.detectChanges();
    });
  }

  private flattenCommentTree(comments: PostComment[]): PostComment[] {
    return comments.flatMap((comment) => [comment, ...(comment.replies ?? [])]);
  }
}





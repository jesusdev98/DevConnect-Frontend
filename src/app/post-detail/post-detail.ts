import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, distinctUntilChanged, map, startWith, takeUntil } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { CommentService, PostComment } from '../services/comment.service';
import { LikeService } from '../services/like.service';
import { Post, PostService } from '../services/post-service';
import { UiFeedbackService } from '../services/ui-feedback.service';

@Component({
  selector: 'app-post-detail',
  standalone: false,
  templateUrl: './post-detail.html',
  styleUrl: './post-detail.scss',
})
export class PostDetail implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly postService = inject(PostService);
  private readonly authService = inject(AuthService);
  private readonly likeService = inject(LikeService);
  private readonly commentService = inject(CommentService);
  private readonly feedback = inject(UiFeedbackService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();
  private loadingWatchdog: ReturnType<typeof setTimeout> | null = null;

  post: Post | null = null;
  comments: PostComment[] = [];
  originProfileRoute: string | null = null;
  isLoading = true;
  isNotFound = false;
  loadError = '';
  isCommentsOpen = false;
  isLoadingComments = false;
  isSavingPost = false;
  activeReplyCommentId: number | null = null;
  activeEditCommentId: number | null = null;
  private commentsLoaded = false;

  constructor() {
    this.originProfileRoute = this.resolveOriginProfileRoute();
  }

  get profileRoute(): string | string[] {
    if (this.originProfileRoute) {
      return this.originProfileRoute;
    }

    if (!this.post) {
      return '/profile';
    }

    const username = (this.post.author?.username ?? '').trim();
    return username ? ['/profile', username] : '/profile';
  }

  get canEditCurrentPost(): boolean {
    if (!this.post) {
      return false;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return false;
    }

    const isAuthor = Number(this.post.author?.id) === Number(currentUser.id);

    return isAuthor;
  }

  get canDeleteCurrentPost(): boolean {
    if (!this.post) {
      return false;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return false;
    }

    const isAdmin = currentUser.role === 'admin';
    const isAuthor = Number(this.post.author?.id) === Number(currentUser.id);

    return isAdmin || isAuthor;
  }

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.originProfileRoute = this.resolveOriginProfileRoute();
      });

    this.route.paramMap
      .pipe(
        map((params) => params.get('id')),
        startWith(this.route.snapshot.paramMap.get('id')),
        distinctUntilChanged(),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (idParam) => {
          this.handlePostIdParam(idParam);
        },
        error: (error: unknown) => {
          this.post = null;
          this.isNotFound = false;
          this.loadError = 'No se pudo cargar la publicación.';
          this.isLoading = false;
        },
      });
  }

  private handlePostIdParam(idParam: string | null): void {
    this.isCommentsOpen = false;
    this.isLoadingComments = false;
    this.activeReplyCommentId = null;
    this.activeEditCommentId = null;
    this.comments = [];
    this.commentsLoaded = false;
    const postId = Number(idParam);
    if (!Number.isFinite(postId) || postId <= 0) {
      this.clearLoadingWatchdog();
      this.post = null;
      this.isNotFound = true;
      this.loadError = '';
      this.isLoading = false;
      return;
    }

    const snapshotPost = this.resolvePostSnapshot(postId);
    if (snapshotPost !== null) {
      this.clearLoadingWatchdog();
      this.post = snapshotPost;
      this.likeService.hydratePosts([snapshotPost]);
      this.isNotFound = false;
      this.loadError = '';
      this.isLoading = false;
      return;
    }

    this.loadPost(postId);
  }

  private loadPost(postId: number): void {
    this.clearLoadingWatchdog();
    this.post = null;
    this.isNotFound = false;
    this.loadError = '';
    this.isLoading = true;

    // Freno de seguridad UI: evita spinner infinito si la request queda pendiente.
    this.loadingWatchdog = setTimeout(() => {
      if (!this.isLoading) {
        return;
      }

      this.isLoading = false;
      this.isNotFound = false;
      this.loadError = 'La carga tardó demasiado. Intenta de nuevo.';
    }, 12000);

    this.postService.getPostById(postId)
      .pipe(
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (post) => {
          this.clearLoadingWatchdog();
          this.post = post;
          this.likeService.hydratePosts([post]);
          this.isNotFound = false;
          this.loadError = '';
          this.isLoading = false;
        },
        error: (error: unknown) => {
          this.clearLoadingWatchdog();
          this.post = null;
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.isNotFound = true;
            this.loadError = '';
          } else {
            this.isNotFound = false;
            this.loadError = 'No se pudo cargar la publicación.';
          }
          this.isLoading = false;
        },
      });
  }

  private clearLoadingWatchdog(): void {
    if (this.loadingWatchdog === null) {
      return;
    }

    clearTimeout(this.loadingWatchdog);
    this.loadingWatchdog = null;
  }

  private resolvePostSnapshot(postId: number): Post | null {
    const navState = this.router.getCurrentNavigation()?.extras?.state as { postSnapshot?: unknown } | undefined;
    const navSnapshot = this.toPostSnapshot(navState?.postSnapshot, postId);
    if (navSnapshot !== null) {
      return navSnapshot;
    }

    const historySnapshot = this.toPostSnapshot(history.state?.postSnapshot, postId);
    if (historySnapshot !== null) {
      return historySnapshot;
    }

    return null;
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

    const tags = Array.isArray(raw['tags'])
      ? raw['tags'].filter((tag): tag is string => typeof tag === 'string')
      : [];
    const tagIds = Array.isArray(raw['tagIds'])
      ? raw['tagIds']
        .map((tagId) => Number(tagId))
        .filter((tagId) => Number.isFinite(tagId) && tagId > 0)
      : [];

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

  openEditPost(post: Post): void {
    const normalizedPostId = Number(post?.id);
    if (!Number.isFinite(normalizedPostId) || normalizedPostId <= 0) {
      return;
    }

    this.router.navigate(['/home/edit-post', normalizedPostId], {
      state: {
        postSnapshot: post,
        editOrigin: 'detail',
      },
    });
  }

  canToggleSavePost(): boolean {
    return Boolean(this.authService.getCurrentUser()?.id);
  }

  getSavePostAriaLabel(post: Post): string {
    return post.isSaved ? 'Quitar publicación de guardados' : 'Guardar publicación';
  }

  toggleSavePost(post: Post): void {
    const postId = Number(post?.id);
    if (!this.canToggleSavePost() || !Number.isFinite(postId) || postId <= 0 || this.isSavingPost) {
      return;
    }

    this.isSavingPost = true;
    const request$ = post.isSaved ? this.postService.unsavePost(postId) : this.postService.savePost(postId);

    request$.subscribe({
      next: (updatedPost) => {
        post.isSaved = updatedPost.isSaved;
        this.isSavingPost = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.isSavingPost = false;
        this.feedback.error('No se pudo actualizar el guardado de la publicación.');
        this.cdr.detectChanges();
      },
    });
  }

  deleteCurrentPost(postId: number): void {
    const normalizedPostId = Number(postId);
    if (!Number.isFinite(normalizedPostId) || normalizedPostId <= 0) {
      return;
    }

    this.postService.deletePost(normalizedPostId).subscribe({
      next: () => {
        this.feedback.success('Publicación eliminada correctamente.');
        this.router.navigate(['/home']);
      },
      error: () => {
        this.feedback.error('No se pudo eliminar la publicación.');
        this.cdr.detectChanges();
      },
    });
  }

  private resolveOriginProfileRoute(): string | null {
    const queryRoute = (this.route.snapshot.queryParamMap.get('fromProfile') ?? '').trim();
    if (this.isValidProfileRoute(queryRoute)) {
      return queryRoute;
    }

    const navState = this.router.getCurrentNavigation()?.extras?.state as { fromProfile?: unknown } | undefined;
    const stateRoute = typeof navState?.fromProfile === 'string' ? navState.fromProfile.trim() : '';
    if (this.isValidProfileRoute(stateRoute)) {
      return stateRoute;
    }

    const historyRoute = typeof history.state?.fromProfile === 'string' ? String(history.state.fromProfile).trim() : '';
    if (this.isValidProfileRoute(historyRoute)) {
      return historyRoute;
    }

    return null;
  }

  private isValidProfileRoute(path: string): boolean {
    return path === '/profile' || path.startsWith('/profile/');
  }

  togglePostLike(postId: number): void {
    const userId = this.authService.getCurrentUser()?.id;
    if (!userId) {
      return;
    }

    const wasLiked = this.hasLikedPost(postId);
    this.likeService.togglePostLike(postId);
    this.feedback.info(wasLiked ? 'Has quitado tu me gusta de la publicación.' : 'Has marcado me gusta en la publicación.');
  }

  getPostLikeCount(postId: number): number {
    return this.likeService.getPostLikeCount(postId);
  }

  hasLikedPost(postId: number): boolean {
    const userId = this.authService.getCurrentUser()?.id;
    return userId ? this.likeService.hasLikedPost(postId) : false;
  }

  getPostLikeAriaLabel(postId: number): string {
    return this.hasLikedPost(postId) ? 'Quitar me gusta de la publicación' : 'Marcar me gusta en la publicación';
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
        this.cdr.detectChanges();
      },
      error: () => {
        this.feedback.error('No se pudo actualizar el estado de fijado de la publicación.');
        this.cdr.detectChanges();
      },
    });
  }

  toggleCommentPin(comment: PostComment): void {
    const postId = Number(this.post?.id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return;
    }

    this.commentService.toggleAdminPin(comment.id).subscribe({
      next: (result) => {
        this.feedback.success(result.isPinned ? 'Comentario fijado correctamente.' : 'Comentario desfijado correctamente.');
        this.loadCommentTree(postId);
      },
      error: () => {
        this.feedback.error('No se pudo actualizar el estado de fijado del comentario.');
        this.cdr.detectChanges();
      },
    });
  }

  toggleCommentLike(commentId: number): void {
    const userId = this.authService.getCurrentUser()?.id;
    if (!userId) {
      return;
    }

    const wasLiked = this.hasLikedComment(commentId);
    this.likeService.toggleCommentLike(commentId);
    this.feedback.info(wasLiked ? 'Has quitado tu me gusta del comentario.' : 'Has marcado me gusta en el comentario.');
  }

  getCommentLikeCount(commentId: number): number {
    return this.likeService.getCommentLikeCount(commentId);
  }

  hasLikedComment(commentId: number): boolean {
    const userId = this.authService.getCurrentUser()?.id;
    return userId ? this.likeService.hasLikedComment(commentId) : false;
  }

  getCommentLikeAriaLabel(commentId: number): string {
    return this.hasLikedComment(commentId) ? 'Quitar me gusta del comentario' : 'Marcar me gusta en el comentario';
  }

  canDeleteComment(comment: PostComment): boolean {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return false;
    }

    const isAdmin = currentUser.role === 'admin';
    const isAuthor = Number(comment.userId) === Number(currentUser.id);

    return isAdmin || isAuthor;
  }

  canEditComment(comment: PostComment): boolean {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return false;
    }

    const isAuthor = Number(comment.userId) === Number(currentUser.id);

    return isAuthor;
  }

  deleteComment(comment: PostComment): void {
    const postId = Number(this.post?.id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return;
    }

    this.commentService.deleteComment(comment.id).subscribe({
      next: () => {
        if (comment.parentId === null && this.post && this.post.commentsCount > 0) {
          this.post.commentsCount--;
        }
        if (this.activeReplyCommentId === comment.id) {
          this.activeReplyCommentId = null;
        }
        if (this.activeEditCommentId === comment.id) {
          this.cancelEditComment();
        }
        this.loadCommentTree(postId);
        this.feedback.success('Comentario eliminado correctamente.');
      },
      error: () => {
        this.feedback.error('No se pudo eliminar el comentario.');
        this.cdr.detectChanges();
      },
    });
  }

  toggleComments(postId: number): void {
    const isOpening = !this.isCommentsOpen;
    this.isCommentsOpen = isOpening;
    if (!isOpening) {
      this.activeReplyCommentId = null;
      this.cancelEditComment();
    }

    if (!isOpening || this.commentsLoaded) {
      return;
    }

    this.loadCommentTree(postId);
  }

  openReplyForm(commentId: number): void {
    this.cancelEditComment();
    this.activeReplyCommentId = commentId;
  }

  closeReplyForm(): void {
    this.activeReplyCommentId = null;
  }

  openEditComment(comment: PostComment): void {
    this.activeReplyCommentId = null;
    this.activeEditCommentId = comment.id;
  }

  cancelEditComment(): void {
    this.activeEditCommentId = null;
  }

  saveEditedComment(postId: number, comment: PostComment, textarea: HTMLTextAreaElement): void {
    const text = textarea.value.trim();
    if (text === '') {
      return;
    }

    this.commentService.updateComment(comment.id, text).subscribe({
      next: () => {
        this.cancelEditComment();
        this.loadCommentTree(postId);
        this.feedback.success('Comentario actualizado correctamente.');
      },
      error: () => {
        this.feedback.error('No se pudo actualizar el comentario.');
        this.cdr.detectChanges();
      },
    });
  }

  submitReply(postId: number, parentComment: PostComment, textarea: HTMLTextAreaElement): void {
    const text = textarea.value.trim();
    if (text === '') {
      return;
    }

    this.commentService.addComment(postId, text, parentComment.id).subscribe({
      next: () => {
        textarea.value = '';
        this.closeReplyForm();
        this.loadCommentTree(postId);
      },
      error: () => {
        this.feedback.error('No se pudo enviar la respuesta.');
        this.cdr.detectChanges();
      },
    });
  }

  private loadCommentTree(postId: number): void {
    this.isLoadingComments = true;
    this.commentService.loadCommentTree(postId).subscribe({
      next: (comments) => {
        this.comments = [...comments];
        this.commentsLoaded = true;
        this.isLoadingComments = false;
        this.likeService.hydrateComments(this.flattenCommentTree(comments));
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingComments = false;
        this.feedback.error('No se pudieron cargar los comentarios.');
        this.cdr.detectChanges();
      },
    });
  }

  addComment(postId: number, textarea: HTMLTextAreaElement, post: Post): void {
    const text = textarea.value.trim();
    if (text === '') {
      return;
    }

    this.commentService.addComment(postId, text).subscribe({
      next: (comment) => {
        const rootComment: PostComment = {
          ...comment,
          isPinned: comment.isPinned ?? false,
          parentId: comment.parentId ?? null,
          replies: [],
        };
        this.comments = [...this.comments, rootComment];
        this.likeService.hydrateComments([comment]);
        post.commentsCount++;
        textarea.value = '';
        this.cdr.detectChanges();
      },
      error: () => {
        this.feedback.error('No se pudo enviar el comentario.');
        this.cdr.detectChanges();
      },
    });
  }

  getVisibleCommentCount(): number {
    return this.flattenCommentTree(this.comments).length;
  }

  private flattenCommentTree(comments: PostComment[]): PostComment[] {
    return comments.flatMap((comment) => [comment, ...(comment.replies ?? [])]);
  }

  ngOnDestroy(): void {
    this.clearLoadingWatchdog();
    this.destroy$.next();
    this.destroy$.complete();
  }
}


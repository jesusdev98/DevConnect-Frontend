import { ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { CommentService, PostComment } from '../../services/comment.service';
import { LikeService } from '../../services/like.service';
import { Post, PostService } from '../../services/post-service';
import { UiFeedbackService } from '../../services/ui-feedback.service';

@Component({
  selector: 'app-profile-posts-tab',
  standalone: false,
  templateUrl: './profile-posts-tab.html',
  styleUrl: './profile-posts-tab.scss',
})
export class ProfilePostsTab {
  private readonly authService = inject(AuthService);
  private readonly likeService = inject(LikeService);
  private readonly commentService = inject(CommentService);
  private readonly postService = inject(PostService);
  private readonly feedback = inject(UiFeedbackService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() posts: readonly Post[] = [];
  @Input() postsError = false;
  @Input() postsLoading = false;
  @Input() postsErrorMessage = 'No se pudieron cargar las publicaciones.';
  @Input() emptyMessage = 'Aún no hay publicaciones.';
  @Input() viewMode: 'own' | 'saved' | 'liked' = 'own';
  @Input() canTogglePostLike = false;
  @Input() canEditPostFn: (post: Post) => boolean = () => false;
  @Input() hasLikedPostFn: (postId: number) => boolean = () => false;
  @Input() getPostLikeCountFn: (postId: number) => number = () => 0;

  @Output() readonly openPostRequested = new EventEmitter<Post>();
  @Output() readonly editPostRequested = new EventEmitter<Post>();
  @Output() readonly togglePostLikeRequested = new EventEmitter<number>();
  @Output() readonly saveStateChanged = new EventEmitter<{ post: Post; isSaved: boolean }>();

  openedCommentsPostId: number | null = null;
  loadingCommentsPostId: number | null = null;
  submittingCommentPostId: number | null = null;
  private readonly activeReplyCommentIdByPost = new Map<number, number>();
  private readonly activeEditCommentIdByPost = new Map<number, number>();
  private readonly savingPostIds = new Set<number>();
  private readonly commentsMap = new Map<number, PostComment[]>();

  toggleComments(postId: number): void {
    const isOpening = this.openedCommentsPostId !== postId;
    this.openedCommentsPostId = isOpening ? postId : null;
    if (!isOpening) {
      this.activeReplyCommentIdByPost.delete(postId);
      this.activeEditCommentIdByPost.delete(postId);
    }

    if (!isOpening || this.commentsMap.has(postId)) {
      return;
    }

    this.loadCommentsForPost(postId);
  }

  isCommentsOpen(postId: number): boolean {
    return this.openedCommentsPostId === postId;
  }

  isCommentsLoading(postId: number): boolean {
    return this.loadingCommentsPostId === postId;
  }

  isSubmittingComment(postId: number): boolean {
    return this.submittingCommentPostId === postId;
  }

  getComments(postId: number): PostComment[] {
    return this.commentsMap.get(postId) ?? [];
  }

  getVisibleCommentCount(postId: number): number {
    return this.flattenCommentTree(this.getComments(postId)).length;
  }

  canToggleSavePost(): boolean {
    return Boolean(this.authService.getCurrentUser()?.id);
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
        const wasSaved = post.isSaved;
        post.isSaved = updatedPost.isSaved;
        this.saveStateChanged.emit({ post, isSaved: updatedPost.isSaved });
        if (this.viewMode === 'saved' && wasSaved && !updatedPost.isSaved) {
          const nextPosts = (this.posts as Post[]).filter((item) => Number(item.id) !== postId);
          this.posts = nextPosts;
        }
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

  canDeletePost(post: Post): boolean {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      return false;
    }

    const isAdmin = currentUser.role === 'admin';
    const isAuthor = Number(post.author?.id ?? 0) === Number(currentUser.id);

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

  deleteComment(post: Post, comment: PostComment): void {
    this.commentService.deleteComment(comment.id).subscribe({
      next: () => {
        if (comment.parentId === null && post.commentsCount > 0) {
          post.commentsCount--;
        }
        if (this.isReplyFormOpen(post.id, comment.id)) {
          this.closeReplyForm(post.id);
        }
        if (this.isEditFormOpen(post.id, comment.id)) {
          this.cancelEditComment(post.id);
        }
        this.loadCommentsForPost(post.id);
        this.feedback.success('Comentario eliminado correctamente.');
      },
      error: () => {
        this.feedback.error('No se pudo eliminar el comentario.');
        this.cdr.detectChanges();
      },
    });
  }

  deletePost(post: Post): void {
    const postId = Number(post?.id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return;
    }

    this.postService.deletePost(postId).subscribe({
      next: () => {
        const nextPosts = (this.posts as Post[]).filter((item) => Number(item.id) !== postId);
        this.posts = nextPosts;
        this.commentsMap.delete(postId);
        if (this.openedCommentsPostId === postId) {
          this.openedCommentsPostId = null;
        }
        this.feedback.success('Publicación eliminada correctamente.');
        this.cdr.detectChanges();
      },
      error: () => {
        this.feedback.error('No se pudo eliminar la publicación.');
        this.cdr.detectChanges();
      },
    });
  }

  addComment(post: Post, textarea: HTMLTextAreaElement): void {
    const text = textarea.value.trim();
    if (!text || this.submittingCommentPostId === post.id) {
      return;
    }

    this.submittingCommentPostId = post.id;
    this.commentService.addComment(post.id, text).subscribe({
      next: (comment) => {
        const current = this.commentsMap.get(post.id) ?? [];
        const rootComment: PostComment = {
          ...comment,
          parentId: comment.parentId ?? null,
          replies: [],
        };
        this.commentsMap.set(post.id, [...current, rootComment]);
        this.likeService.hydrateComments([comment]);
        post.commentsCount++;
        textarea.value = '';
        this.submittingCommentPostId = null;
        this.cdr.detectChanges();
      },
      error: () => {
        this.submittingCommentPostId = null;
        this.feedback.error('No se pudo enviar el comentario.');
        this.cdr.detectChanges();
      },
    });
  }

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

  saveEditedComment(post: Post, comment: PostComment, textarea: HTMLTextAreaElement): void {
    const text = textarea.value.trim();
    if (!text || this.submittingCommentPostId === post.id) {
      return;
    }

    this.submittingCommentPostId = post.id;
    this.commentService.updateComment(comment.id, text).subscribe({
      next: () => {
        this.cancelEditComment(post.id);
        this.loadCommentsForPost(post.id);
        this.feedback.success('Comentario actualizado correctamente.');
      },
      error: () => {
        this.submittingCommentPostId = null;
        this.feedback.error('No se pudo actualizar el comentario.');
        this.cdr.detectChanges();
      },
    });
  }

  submitReply(post: Post, parentComment: PostComment, textarea: HTMLTextAreaElement): void {
    const text = textarea.value.trim();
    if (!text || this.submittingCommentPostId === post.id) {
      return;
    }

    this.submittingCommentPostId = post.id;
    this.commentService.addComment(post.id, text, parentComment.id).subscribe({
      next: () => {
        textarea.value = '';
        this.closeReplyForm(post.id);
        this.loadCommentsForPost(post.id);
      },
      error: () => {
        this.submittingCommentPostId = null;
        this.feedback.error('No se pudo enviar la respuesta.');
        this.cdr.detectChanges();
      },
    });
  }

  private loadCommentsForPost(postId: number): void {
    this.loadingCommentsPostId = postId;
    this.commentService.loadCommentTree(postId).subscribe({
      next: (comments) => {
        this.commentsMap.set(postId, [...comments]);
        this.likeService.hydrateComments(this.flattenCommentTree(comments));
        this.loadingCommentsPostId = null;
        this.submittingCommentPostId = this.submittingCommentPostId === postId ? null : this.submittingCommentPostId;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadingCommentsPostId = null;
        this.submittingCommentPostId = this.submittingCommentPostId === postId ? null : this.submittingCommentPostId;
        this.feedback.error('No se pudieron cargar los comentarios.');
        this.cdr.detectChanges();
      },
    });
  }

  private flattenCommentTree(comments: PostComment[]): PostComment[] {
    return comments.flatMap((comment) => [comment, ...(comment.replies ?? [])]);
  }
}


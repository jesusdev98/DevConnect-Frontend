import { HttpErrorResponse } from '@angular/common/http';
import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, catchError, map, of, switchMap, takeUntil, tap } from 'rxjs';
import { AuthService, ChangePasswordData } from '../services/auth.service';
import { FollowService } from '../services/follow.service';
import { LikeService } from '../services/like.service';
import { Post, PostService } from '../services/post-service';
import { ProfileLink, ProfileLinkService } from '../services/profile-link.service';
import { UiFeedbackService } from '../services/ui-feedback.service';
import { PublicProfile, UpdateProfilePayload, UserService } from '../services/user.service';
import { environment } from '../../environments/environment';
import { AUTH_ROUTES } from '../auth/auth-routes';

@Component({
  selector: 'app-profile',
  standalone: false,
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile implements OnDestroy, AfterViewInit {
  private readonly postService = inject(PostService);
  private readonly likeService = inject(LikeService);
  private readonly followService = inject(FollowService);
  private readonly feedback = inject(UiFeedbackService);
  private readonly userService = inject(UserService);
  private readonly route = inject(ActivatedRoute);
  private readonly profileLinks = inject(ProfileLinkService);
  private readonly destroy$ = new Subject<void>();

  readonly changePasswordForm: FormGroup;

  isChangingPassword = false;
  isLoadingProfile = true;
  profileNotFound = false;
  isEditingBio = false;
  isSavingBio = false;
  isFollowActionBusy = false;
  postsError = false;

  changePasswordSuccess = '';
  changePasswordError = '';
  changePasswordValidationErrors: Record<string, string[]> = {};
  bioSuccess = '';
  bioError = '';
  bioDraft = '';
  profileHeadlineDraft = '';
  profileSkillsDraft = '';
  isEditingProfileDetails = false;
  isSavingProfileDetails = false;
  profileDetailsSuccess = '';
  profileDetailsError = '';
  linksSuccess = '';
  linksError = '';
  isSavingLinks = false;
  isDeletingAccount = false;

  // Pestaña activa del perfil: cada valor muestra una sección distinta.
  activeTab: 'posts' | 'liked' | 'saved' | 'logros' | 'cuenta' = 'posts';
  currentUser: ReturnType<AuthService['getCurrentUser']> = null;
  profile: PublicProfile | null = null;
  profilePosts$: Observable<Post[]> = of([]);
  likedPosts: Post[] = [];
  isLoadingLikedPosts = false;
  likedPostsError = false;
  private hasLoadedLikedPosts = false;
  private likedPostsDirty = false;
  savedPosts: Post[] = [];
  isLoadingSavedPosts = false;
  savedPostsError = false;
  links: ProfileLink[] = [];
  editingLink: ProfileLink['type'] | null = null;
  linkEditValue = '';

  // Referencias estables para no acoplar los subcomponentes al servicio.
  readonly hasLikedPostRef = (postId: number): boolean => this.hasLikedPost(postId);
  readonly getPostLikeCountRef = (postId: number): number => this.getPostLikeCount(postId);
  readonly canEditPostRef = (post: Post): boolean => this.canEditPost(post);
  readonly onDeleteAccountRef = () => this.onDeleteAccount();

  // Overrides locales para reflejar cambios de follow sin recargar todo el perfil.
  private followedByCurrentUserOverride: boolean | null = null;
  private followersCountOverride: number | null = null;

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.currentUser = this.authService.getCurrentUser();
    this.links = this.profileLinks.getDefaultLinks();
    this.changePasswordForm = this.formBuilder.group({
      // Formulario de cambio de contraseña con validación básica en cliente.
      current_password: ['', [Validators.required, Validators.minLength(8)]],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.maxLength(255),
          Validators.pattern(/^[A-Z].*[!@#$%^&*(),.?":{}|<>].*$/),
        ],
      ],
      password_confirmation: ['', [Validators.required, Validators.minLength(8)]],
    });

    this.route.paramMap
      .pipe(
        takeUntil(this.destroy$),
        switchMap((params) => {
          // Si hay username en la ruta, cargamos un perfil público; si no, usamos el actual.
          const routeUsername = (params.get('username') ?? '').trim();
          this.isLoadingProfile = true;
          this.profileNotFound = false;
          this.postsError = false;
          this.likedPosts = [];
          this.likedPostsError = false;
          this.isLoadingLikedPosts = false;
          this.hasLoadedLikedPosts = false;
          this.likedPostsDirty = false;
          this.savedPosts = [];
          this.savedPostsError = false;
          this.isLoadingSavedPosts = false;

          if (routeUsername) {
            return this.userService.getPublicProfileByUsername(routeUsername).pipe(
              catchError((error: unknown) => {
                if (error instanceof HttpErrorResponse && error.status === 404) {
                  return of(null);
                }
                return of(null);
              }),
            );
          }

          return this.resolveCurrentUser().pipe(
            switchMap((user) => {
              if (!user) {
                return of<PublicProfile | null>(null);
              }

              const username = (user.username ?? '').trim();
              // Perfil mínimo de respaldo si falla la petición pública.
              // Perfil mínimo de respaldo si falla la petición pública.
              const fallbackProfile: PublicProfile = {
                id: user.id,
                name: user.name ?? null,
                username: user.username ?? null,
                headline: user.headline ?? null,
                bio: user.bio ?? null,
                skills: user.skills ?? [],
                links: user.links ?? {
                  github: null,
                  linkedin: null,
                  web: null,
                },
                avatar: user.avatar ?? null,
                postsCount: 0,
                commentsCount: 0,
                followersCount: 0,
                followedByCurrentUser: false,
              };

              if (!username) {
                return of(fallbackProfile);
              }

              return this.userService.getPublicProfileByUsername(username).pipe(
                catchError(() => of(fallbackProfile)),
              );
            }),
          );
        }),
      )
      .subscribe((profile) => {
        this.isLoadingProfile = false;
        this.isEditingBio = false;
        this.isSavingBio = false;
        this.isEditingProfileDetails = false;
        this.isSavingProfileDetails = false;
        this.bioSuccess = '';
        this.bioError = '';
        this.profileDetailsSuccess = '';
        this.profileDetailsError = '';
        this.linksSuccess = '';
        this.linksError = '';
        this.isSavingLinks = false;
        this.followedByCurrentUserOverride = null;
        this.followersCountOverride = null;

        if (profile === null) {
          this.profile = null;
          this.profileNotFound = true;
          this.profilePosts$ = of([]);
          this.likedPosts = [];
          this.hasLoadedLikedPosts = false;
          this.likedPostsDirty = false;
          this.savedPosts = [];
          this.activeTab = 'posts';
          this.profileHeadlineDraft = '';
          this.profileSkillsDraft = '';
          this.links = this.profileLinks.getDefaultLinks();
          this.cdr.markForCheck();
          return;
        }

        this.profile = profile;
        this.bioDraft = profile.bio ?? '';
        this.profileHeadlineDraft = profile.headline ?? '';
        this.profileSkillsDraft = (profile.skills ?? []).join(', ');
        this.links = this.profileLinks.fromData(profile.links);
        this.profileNotFound = false;

        if (!this.showAccountTab && (this.activeTab === 'cuenta' || this.activeTab === 'saved' || this.activeTab === 'liked')) {
          this.activeTab = 'posts';
        }

        this.loadPostsByUser(profile.id);
        if (this.showAccountTab) {
          this.loadSavedPosts();
        } else {
          this.likedPosts = [];
          this.likedPostsError = false;
          this.isLoadingLikedPosts = false;
          this.hasLoadedLikedPosts = false;
          this.likedPostsDirty = false;
          this.savedPosts = [];
          this.savedPostsError = false;
          this.isLoadingSavedPosts = false;
        }
        this.cdr.detectChanges();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit(): void {
    const self = this;

    if (!environment.production && typeof window !== 'undefined' && 'Cypress' in window) {
      (window as Window & { __DEVCONNECT_DELETE_ME__?: () => void }).__DEVCONNECT_DELETE_ME__ = function () {
        return self.onDeleteAccount();
      };
    }

    setTimeout(() => {
      this.cdr.detectChanges();
    });
  }

  get displayName(): string {
    return this.profile?.name ?? this.profile?.username ?? 'Usuario';
  }

  get displayUsername(): string {
    return this.profile?.username ?? '';
  }

  get profileRoleLabel(): string {
    // El subtítulo visible sale del perfil editable; si falta, usamos un valor por defecto.
    return this.profile?.headline?.trim() || 'Desarrollador Full Stack';
  }

  get profileOriginRoute(): string {
    const routeUsername = (this.route.snapshot.paramMap.get('username') ?? '').trim();
    if (!routeUsername) {
      return '/profile';
    }

    return `/profile/${routeUsername}`;
  }

  get initials(): string {
    const source = this.profile?.name ?? this.profile?.username ?? '';
    return source
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join('');
  }

  get isOwnProfile(): boolean {
    return Number(this.currentUser?.id) === Number(this.profile?.id);
  }

  get showAccountTab(): boolean {
    return this.isOwnProfile && !this.profileNotFound;
  }

  get canDeleteOwnAccount(): boolean {
    return this.showAccountTab && this.currentUser?.role !== 'admin';
  }

  get canTogglePostLike(): boolean {
    return this.currentUser !== null;
  }

  get displayBio(): string {
    // Texto de reserva cuando el usuario todavía no ha escrito biografía.
    const bio = this.profile?.bio?.trim();
    return bio ? bio : 'Sin biografía disponible.';
  }

  get profileSkills(): string[] {
    // Las skills vienen del backend, pero se exponen aquí para la plantilla.
    return this.profile?.skills ?? [];
  }

  get followedByCurrentUser(): boolean {
    if (this.followedByCurrentUserOverride !== null) {
      return this.followedByCurrentUserOverride;
    }

    return this.profile?.followedByCurrentUser ?? false;
  }

  get postsCount(): number {
    return this.profile?.postsCount ?? 0;
  }

  get commentsCount(): number {
    return this.profile?.commentsCount ?? 0;
  }

  get followersCount(): number {
    if (this.followersCountOverride !== null) {
      return this.followersCountOverride;
    }

    return this.profile?.followersCount ?? 0;
  }

  onAvatarChange(base64: string): void {
    if (!this.isOwnProfile || !this.profile) return;

    // Actualizamos la UI primero y luego sincronizamos con backend.
    const previousAvatar = this.profile.avatar;
    this.profile = { ...this.profile, avatar: base64 };
    this.cdr.detectChanges();

    this.userService.updateMyAvatar(base64).pipe(takeUntil(this.destroy$)).subscribe({
      next: (result) => {
        if (!this.profile) return;
        this.profile = { ...this.profile, avatar: result.avatar ?? null };
        this.authService.patchCurrentUser({ avatar: result.avatar ?? null });
        this.cdr.detectChanges();
      },
      error: () => {
        if (!this.profile) return;
        this.profile = { ...this.profile, avatar: previousAvatar };
        this.cdr.detectChanges();
      },
    });
  }

  startBioEdit(): void {
    if (!this.isOwnProfile) return;

    // Copiamos el valor actual al borrador antes de mostrar el textarea.
    this.bioError = '';
    this.bioSuccess = '';
    this.bioDraft = this.profile?.bio ?? '';
    this.isEditingBio = true;
  }

  cancelBioEdit(): void {
    this.isEditingBio = false;
    this.bioError = '';
    this.bioDraft = this.profile?.bio ?? '';
  }

  startProfileDetailsEdit(): void {
    if (!this.isOwnProfile) return;

    // Preparamos los borradores con los valores actuales antes de editar.
    this.profileDetailsError = '';
    this.profileDetailsSuccess = '';
    this.profileHeadlineDraft = this.profile?.headline ?? '';
    this.profileSkillsDraft = this.profileSkills.join(', ');
    this.isEditingProfileDetails = true;
  }

  cancelProfileDetailsEdit(): void {
    this.isEditingProfileDetails = false;
    this.profileDetailsError = '';
    this.profileDetailsSuccess = '';
    this.profileHeadlineDraft = this.profile?.headline ?? '';
    this.profileSkillsDraft = this.profileSkills.join(', ');
  }

  saveProfileDetails(): void {
    if (!this.isOwnProfile || this.profile === null) return;

    // Limpiamos el estado visual antes de guardar cambios del perfil.
    this.profileDetailsError = '';
    this.profileDetailsSuccess = '';
    this.isSavingProfileDetails = true;

    // Normalizamos el texto para guardar un dato limpio en backend.
    const payload: UpdateProfilePayload = {
      headline: this.normalizeHeadline(this.profileHeadlineDraft),
      skills: this.normalizeSkillsDraft(this.profileSkillsDraft),
    };

    this.userService.updateMyProfile(payload).subscribe({
      next: (result) => {
        if (!this.profile) {
          return;
        }

        this.profile = {
          ...this.profile,
          headline: result.headline,
          skills: result.skills,
        };
        this.authService.patchCurrentUser({
          headline: result.headline,
          skills: result.skills,
        });
        this.isEditingProfileDetails = false;
        this.isSavingProfileDetails = false;
        this.profileDetailsSuccess = 'Perfil profesional actualizado correctamente.';
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.isSavingProfileDetails = false;
        this.profileDetailsError = error.error?.message ?? 'No se pudo actualizar el perfil profesional.';
        this.cdr.detectChanges();
      },
    });
  }

  saveBio(): void {
    if (!this.isOwnProfile || this.profile === null) return;

    // Guardado independiente de la biografía para no mezclarlo con el perfil general.
    this.bioError = '';
    this.bioSuccess = '';
    this.isSavingBio = true;

    this.userService.updateMyBio(this.bioDraft).subscribe({
      next: (result) => {
        if (!this.profile) {
          return;
        }

        this.profile = {
          ...this.profile,
          bio: result.bio,
        };
        this.isEditingBio = false;
        this.isSavingBio = false;
        this.bioSuccess = 'Biografía actualizada correctamente.';
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.isSavingBio = false;
        this.bioError = error.error?.message ?? 'No se pudo actualizar la biografía.';
        this.cdr.detectChanges();
      },
    });
  }

  toggleFollowProfile(): void {
    const profileId = this.profile?.id;
    const currentUserId = this.currentUser?.id;
    if (!profileId || !currentUserId || this.isOwnProfile || this.isFollowActionBusy) return;

    this.isFollowActionBusy = true;

    this.followService.toggleWithResult(currentUserId, profileId).subscribe({
      next: (state) => {
        this.followedByCurrentUserOverride = state.followedByCurrentUser;
        this.followersCountOverride = state.followersCount;

        if (this.profile) {
          this.profile = {
            ...this.profile,
            followedByCurrentUser: state.followedByCurrentUser,
            followersCount: state.followersCount,
          };
        }

        this.cdr.detectChanges();
      },
      error: () => {
        this.cdr.detectChanges();
      },
      complete: () => {
        this.isFollowActionBusy = false;
        this.cdr.detectChanges();
      },
    });
  }

  onChangePassword(): void {
    this.clearChangePasswordState();

    if (this.changePasswordForm.invalid || this.passwordsDoNotMatch()) {
      this.changePasswordForm.markAllAsTouched();
      this.changePasswordError = 'Revisa los datos del formulario.';
      this.cdr.detectChanges();
      return;
    }

    this.isChangingPassword = true;
    this.cdr.detectChanges();

    this.authService.changePassword(this.changePasswordForm.getRawValue() as ChangePasswordData).subscribe({
      next: () => {
        this.isChangingPassword = false;
        this.changePasswordSuccess = 'Contraseña actualizada correctamente.';
        this.changePasswordForm.reset();
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.isChangingPassword = false;

        if (error.status === 401) {
          this.cdr.detectChanges();
          this.router.navigate([AUTH_ROUTES.login]);
          return;
        }

        if (error.status === 422) {
          this.changePasswordValidationErrors = (error.error?.errors as Record<string, string[]>) ?? {};
          this.changePasswordError =
            error.error?.message ??
            this.changePasswordValidationErrors['current_password']?.[0] ??
            'No se pudo actualizar la contraseña.';
          this.cdr.detectChanges();
          return;
        }

        this.changePasswordError = 'No se pudo actualizar la contraseña.';
        this.cdr.detectChanges();
      },
    });
  }

  logout(): void {
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate([AUTH_ROUTES.login]);
      },
      error: () => {
        this.router.navigate([AUTH_ROUTES.login]);
      },
    });
  }

  onDeleteAccount(): void {
    if (this.isDeletingAccount) return;

    const confirmed = window.confirm('¿Seguro?');
    if (!confirmed) return;

    this.isDeletingAccount = true;
    this.authService.deleteMe().subscribe({
      next: () => {
        this.router.navigate([AUTH_ROUTES.login]);
      },
      error: () => {
        this.isDeletingAccount = false;
        this.feedback.error('No se pudo eliminar la cuenta.');
        this.cdr.detectChanges();
      },
    });
  }

  togglePostLike(postId: number): void {
    const userId = this.currentUser?.id;
    if (!userId) return;

    const wasLiked = this.hasLikedPost(postId);
    this.likeService.togglePostLike(postId);
    if (this.activeTab === 'liked' && wasLiked) {
      this.likedPosts = this.likedPosts.filter((likedPost) => Number(likedPost.id) !== postId);
      this.likedPostsError = false;
      this.likedPostsDirty = false;
    } else if (this.activeTab !== 'liked') {
      this.likedPostsDirty = true;
    }
    this.feedback.info(
      wasLiked
        ? 'Has quitado tu me gusta de la publicación.'
        : 'Has marcado me gusta en la publicación.',
    );
  }

  getPostLikeCount(postId: number): number {
    return this.likeService.getPostLikeCount(postId);
  }

  hasLikedPost(postId: number): boolean {
    const userId = this.currentUser?.id;
    return userId ? this.likeService.hasLikedPost(postId) : false;
  }

  canEditPost(post: Post): boolean {
    if (!this.currentUser) {
      return false;
    }

    const isAuthor = Number(post.author?.id) === Number(this.currentUser.id);

    return isAuthor;
  }

  openPostDetail(post: Post): void {
    const normalizedPostId = Number(post?.id);
    if (!Number.isFinite(normalizedPostId) || normalizedPostId <= 0) {
      return;
    }

    const fromProfile = this.profileOriginRoute;
    this.router.navigate(
      ['/home/post', normalizedPostId],
      {
        queryParams: { fromProfile },
        state: { fromProfile, postSnapshot: post },
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
        editOrigin: 'profile',
        fromProfile: this.profileOriginRoute,
      },
    });
  }

  setActiveTab(tab: 'posts' | 'liked' | 'saved' | 'logros' | 'cuenta'): void {
    // La pestaña de cuenta carga datos extra solo cuando el usuario la abre.
    this.activeTab = tab;
    if (tab === 'liked' && this.showAccountTab) {
      if (!this.hasLoadedLikedPosts || this.likedPostsError || this.likedPostsDirty) {
        this.loadLikedPosts();
      }
    }
    if (tab === 'saved' && this.showAccountTab) {
      this.loadSavedPosts();
    }
  }

  onPostSaveStateChanged(event: { post: Post; isSaved: boolean }): void {
    const postId = Number(event.post?.id);
    if (!Number.isFinite(postId) || postId <= 0) {
      return;
    }

    if (event.isSaved) {
      const exists = this.savedPosts.some((savedPost) => Number(savedPost.id) === postId);
      if (exists) {
        this.savedPosts = this.savedPosts.map((savedPost) => (Number(savedPost.id) === postId ? this.clonePost(event.post) : savedPost));
      } else {
        this.savedPosts = [this.clonePost(event.post), ...this.savedPosts];
      }
      this.savedPostsError = false;
      return;
    }

    this.savedPosts = this.savedPosts.filter((savedPost) => Number(savedPost.id) !== postId);
  }

  startEditLink(type: ProfileLink['type']): void {
    const link = this.links.find((item) => item.type === type);
    this.linksError = '';
    this.linksSuccess = '';
    this.editingLink = type;
    this.linkEditValue = link?.url ?? '';
  }

  saveLink(): void {
    if (!this.editingLink || this.profile === null || !this.isOwnProfile) return;

    this.linksError = '';
    this.linksSuccess = '';
    this.isSavingLinks = true;

    const updatedLinks = this.profileLinks.updateLink(this.links, this.editingLink, this.linkEditValue);
    const payload = this.profileLinks.toData(updatedLinks);

    this.userService.updateMyProfile({ links: payload }).subscribe({
      next: (result) => {
        if (!this.profile) {
          return;
        }

        this.profile = {
          ...this.profile,
          links: result.links,
        };
        this.authService.patchCurrentUser({ links: result.links });
        this.links = this.profileLinks.fromData(result.links);
        this.editingLink = null;
        this.linkEditValue = '';
        this.isSavingLinks = false;
        this.linksSuccess = 'Enlaces actualizados correctamente.';
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.isSavingLinks = false;
        this.linksError = error.error?.message ?? 'No se pudieron actualizar los enlaces.';
        this.cdr.detectChanges();
      },
    });
  }

  cancelEditLink(): void {
    this.linksError = '';
    this.linksSuccess = '';
    this.editingLink = null;
    this.linkEditValue = '';
  }

  private resolveCurrentUser(): Observable<ReturnType<AuthService['getCurrentUser']>> {
    if (this.currentUser?.id) {
      return of(this.currentUser);
    }

    return this.authService.me().pipe(
      map((user) => {
        this.currentUser = user;
        return user;
      }),
      catchError(() => of(null)),
    );
  }

  private loadPostsByUser(userId: number): void {
    // Carga la lista principal de publicaciones del perfil activo.
    this.profilePosts$ = this.postService.getPostsByUser(userId).pipe(
      tap((posts) => {
        this.likeService.hydratePosts(posts);
        if (this.profile && Number(this.profile.id) === Number(userId)) {
          this.profile = {
            ...this.profile,
            postsCount: posts.length,
          };
        }
      }),
      catchError(() => {
        this.postsError = true;
        return of([]);
      }),
    );
  }

  private loadSavedPosts(): void {
    // Los guardados solo se consultan cuando el usuario entra en esa pestaña.
    this.isLoadingSavedPosts = true;
    this.savedPostsError = false;
    this.savedPosts = [];

    this.postService.getSavedPosts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (posts) => {
          this.savedPosts = posts;
          this.likeService.hydratePosts(posts);
          this.savedPostsError = false;
          this.isLoadingSavedPosts = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.savedPosts = [];
          this.savedPostsError = true;
          this.isLoadingSavedPosts = false;
          this.cdr.detectChanges();
        },
      });
  }

  private loadLikedPosts(): void {
    // Los favoritos se cargan bajo demanda para evitar peticiones innecesarias.
    this.isLoadingLikedPosts = true;
    this.likedPostsError = false;
    this.likedPosts = [];

    this.postService.getLikedPosts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (posts) => {
          this.likedPosts = posts;
          this.likeService.hydratePosts(posts);
          this.likedPostsError = false;
          this.hasLoadedLikedPosts = true;
          this.likedPostsDirty = false;
          this.isLoadingLikedPosts = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.likedPosts = [];
          this.likedPostsError = true;
          this.hasLoadedLikedPosts = false;
          this.isLoadingLikedPosts = false;
          this.cdr.detectChanges();
        },
      });
  }

  private clonePost(post: Post): Post {
    return {
      ...post,
      tags: [...(post.tags ?? [])],
      tagIds: [...(post.tagIds ?? [])],
      author: post.author ? { ...post.author } : null,
    };
  }

  private normalizeHeadline(value: string): string | null {
    // Un titular vacío se guarda como null para no persistir cadenas vacías.
    const normalized = value.trim();
    return normalized !== '' ? normalized : null;
  }

  private normalizeSkillsDraft(value: string): string[] {
    // Convertimos una lista libre a un array único y limpio para el JSON.
    const parts = value
      .split(/[\n,]+/)
      .map((skill) => skill.trim())
      .filter((skill) => skill.length > 0);

    return Array.from(new Set(parts)).slice(0, 15);
  }

  private clearChangePasswordState(): void {
    this.changePasswordSuccess = '';
    this.changePasswordError = '';
    this.changePasswordValidationErrors = {};
    this.cdr.detectChanges();
  }

  private passwordsDoNotMatch(): boolean {
    return this.changePasswordForm.get('password')?.value !== this.changePasswordForm.get('password_confirmation')?.value;
  }
}



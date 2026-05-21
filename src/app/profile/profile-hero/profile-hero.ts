import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'app-profile-hero',
  standalone: false,
  templateUrl: './profile-hero.html',
  styleUrl: './profile-hero.scss',
})
export class ProfileHero {
  @ViewChild('avatarInput') avatarInput!: ElementRef<HTMLInputElement>;

  // Identidad visible y datos básicos del perfil.
  @Input() initials = '';
  @Input() profileUserId: number | null = null;
  @Input() displayName = '';
  @Input() displayUsername = '';
  @Input() profileRoleLabel = '';
  @Input() profileSkills: readonly string[] = [];
  @Input() isEditingBio = false;
  @Input() displayBio = '';
  @Input() isOwnProfile = false;
  @Input() bioDraft = '';
  @Input() isSavingBio = false;
  @Input() bioSuccess = '';
  @Input() bioError = '';
  @Input() isFollowActionBusy = false;
  @Input() followedByCurrentUser = false;
  @Input() postsCount = 0;
  @Input() commentsCount = 0;
  @Input() followersCount = 0;
  @Input() set avatar(value: string | null) {
    this.safeAvatar = this.isAllowedAvatarDataUrl(value) ? value : null;
  }
  safeAvatar: string | null = null;
  currentLevel = 1;

  @Output() readonly bioDraftChange = new EventEmitter<string>();
  @Output() readonly startBioEditRequested = new EventEmitter<void>();
  @Output() readonly saveBioRequested = new EventEmitter<void>();
  @Output() readonly cancelBioEditRequested = new EventEmitter<void>();
  @Output() readonly followToggleRequested = new EventEmitter<void>();
  @Output() readonly avatarChangeRequested = new EventEmitter<string>();

  cropSrc: string | null = null;
  zoom = 1;

  get safeCropSrc(): string | null {
    return this.isAllowedAvatarDataUrl(this.cropSrc) ? this.cropSrc : null;
  }

  constructor(
    private readonly cdr: ChangeDetectorRef,
  ) {}

  readonly zoomMin = 1;
  readonly zoomMax = 3;
  readonly zoomStep = 0.1;

  onBioDraftInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.bioDraftChange.emit(target?.value ?? '');
  }

  triggerAvatarInput(): void {
    if (!this.isOwnProfile) return;
    this.avatarInput.nativeElement.click();
  }

  onAvatarFileSelected(event: Event): void {
    // Leemos el archivo local como data URL para mostrar el recorte antes de guardar.
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.cropSrc = reader.result as string;
      this.zoom = 1;
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);

    if (input) input.value = '';
  }

  cancelCrop(): void {
    this.cropSrc = null;
  }

  saveCrop(): void {
    if (!this.cropSrc) return;

    // Recortamos la imagen en canvas y la devolvemos al container en base64.
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const coverScale = Math.max(size / img.width, size / img.height) * this.zoom;
      const w = img.width * coverScale;
      const h = img.height * coverScale;
      const x = (size - w) / 2;
      const y = (size - h) / 2;

      ctx.drawImage(img, x, y, w, h);
      const result = canvas.toDataURL('image/jpeg', 0.85);

      this.cropSrc = null;
      this.avatarChangeRequested.emit(result);
      this.cdr.detectChanges();
    };
    img.src = this.cropSrc;
  }

  onZoomInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.zoom = parseFloat(input?.value ?? '1');
  }

  zoomIn(): void {
    this.zoom = Math.min(parseFloat((this.zoom + this.zoomStep).toFixed(1)), this.zoomMax);
  }

  zoomOut(): void {
    this.zoom = Math.max(parseFloat((this.zoom - this.zoomStep).toFixed(1)), this.zoomMin);
  }

  onLevelChange(level: number): void {
    // Normalizamos el nivel para mantener el rango esperado por el componente.
    const normalized = Number.isFinite(level) ? Math.floor(level) : 1;
    this.currentLevel = Math.max(1, Math.min(5, normalized));
  }

  private isAllowedAvatarDataUrl(value: string | null): value is string {
    return typeof value === 'string' && /^data:image\/(?:jpeg|jpg|png|gif|webp);base64,/i.test(value);
  }
}

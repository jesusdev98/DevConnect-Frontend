import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ProfileLink } from '../../services/profile-link.service';

@Component({
  selector: 'app-profile-account-tab',
  standalone: false,
  templateUrl: './profile-account-tab.html',
  styleUrl: './profile-account-tab.scss',
})
export class ProfileAccountTab {
  // Datos del perfil profesional que vienen del container principal.
  @Input() links: readonly ProfileLink[] = [];
  @Input() profileHeadline = '';
  @Input() profileSkills: readonly string[] = [];
  @Input() isEditingProfileDetails = false;
  @Input() profileHeadlineDraft = '';
  @Input() profileSkillsDraft = '';
  @Input() isSavingProfileDetails = false;
  @Input() profileDetailsSuccess = '';
  @Input() profileDetailsError = '';
  @Input() editingLink: ProfileLink['type'] | null = null;
  @Input() linkEditValue = '';
  @Input() linksSuccess = '';
  @Input() linksError = '';
  @Input() isSavingLinks = false;
  @Input({ required: true }) changePasswordForm!: FormGroup;
  @Input() changePasswordSuccess = '';
  @Input() changePasswordError = '';
  @Input() changePasswordValidationErrors: Record<string, string[]> = {};
  @Input() isChangingPassword = false;
  @Input() canDeleteOwnAccount = false;
  @Input() isDeletingAccount = false;
  @Input() deleteOwnAccountAction: (() => void) | null = null;

  @Output() readonly profileHeadlineDraftChange = new EventEmitter<string>();
  @Output() readonly profileSkillsDraftChange = new EventEmitter<string>();
  @Output() readonly startProfileEditRequested = new EventEmitter<void>();
  @Output() readonly saveProfileDetailsRequested = new EventEmitter<void>();
  @Output() readonly cancelProfileEditRequested = new EventEmitter<void>();
  @Output() readonly linkEditValueChange = new EventEmitter<string>();
  @Output() readonly startEditLinkRequested = new EventEmitter<ProfileLink['type']>();
  @Output() readonly saveLinkRequested = new EventEmitter<void>();
  @Output() readonly cancelEditLinkRequested = new EventEmitter<void>();
  @Output() readonly changePasswordRequested = new EventEmitter<void>();

  onDeleteAccountClick(): void {
    this.deleteOwnAccountAction?.();
  }

  get currentPasswordControl() {
    // Atajos para no repetir lookups de formulario en el template.
    return this.changePasswordForm.get('current_password');
  }

  get passwordControl() {
    return this.changePasswordForm.get('password');
  }

  get passwordConfirmationControl() {
    return this.changePasswordForm.get('password_confirmation');
  }

  get normalizedProfileSkills(): string[] {
    // Si ya vienen del backend, las usamos; si no, las derivamos del borrador.
    return this.profileSkills.length > 0 ? [...this.profileSkills] : this.parseSkillsDraft(this.profileSkillsDraft);
  }

  get passwordsDoNotMatch(): boolean {
    return this.passwordControl?.value !== this.passwordConfirmationControl?.value;
  }

  onProfileHeadlineInput(event: Event): void {
    // Reenviamos el texto al container para mantener el estado centralizado.
    const target = event.target as HTMLInputElement | null;
    this.profileHeadlineDraftChange.emit(target?.value ?? '');
  }

  onProfileSkillsInput(event: Event): void {
    // El textarea acepta lista libre; el container la convertirá a JSON.
    const target = event.target as HTMLTextAreaElement | null;
    this.profileSkillsDraftChange.emit(target?.value ?? '');
  }

  onLinkInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.linkEditValueChange.emit(target?.value ?? '');
  }

  private parseSkillsDraft(value: string): string[] {
    // Permite escribir skills separadas por comas o saltos de línea.
    const parts = value
      .split(/[\n,]+/)
      .map((skill) => skill.trim())
      .filter((skill) => skill.length > 0);

    return Array.from(new Set(parts));
  }
}

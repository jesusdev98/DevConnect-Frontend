import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AUTH_ROUTES } from '../auth/auth-routes';
import { AuthService } from '../services/auth.service';

type ActiveTab = 'password' | 'username';

@Component({
  selector: 'app-forgot-password',
  standalone: false,
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword {
  activeTab: ActiveTab = 'password';
  form: FormGroup;
  isSubmitted = false;
  isLoading = false;
  successMessage = '';
  errorMessage = '';
  readonly loginRoute = AUTH_ROUTES.login;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    });
  }

  setTab(tab: ActiveTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.form.reset();
    this.isSubmitted = false;
    this.successMessage = '';
    this.errorMessage = '';
  }

  onSubmit(): void {
    this.isSubmitted = true;
    this.successMessage = '';
    this.errorMessage = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    const email = String(this.form.value.email ?? '').trim();
    const request$ = this.activeTab === 'password'
      ? this.authService.forgotPassword(email)
      : this.authService.forgotUsername(email);

    request$.subscribe({
      next: () => {
        this.isLoading = false;
        this.successMessage = this.activeTab === 'password'
          ? 'Si el email está registrado, recibirás un enlace de recuperación en breve.'
          : 'Si el email está registrado, recibirás tu usuario en breve.';
        this.form.reset();
        this.isSubmitted = false;
        this.cdr.detectChanges();
      },
      error: (error: HttpErrorResponse) => {
        this.isLoading = false;
        if (error.status === 404) {
          this.errorMessage = 'No encontramos ninguna cuenta con ese email.';
        } else if (error.status === 429) {
          this.errorMessage = 'Demasiados intentos. Esperá un momento e intentá de nuevo.';
        } else {
          this.errorMessage = 'No se pudo procesar la solicitud. Intentá de nuevo.';
        }
        this.cdr.detectChanges();
      },
    });
  }
}

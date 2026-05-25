import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
/**
 * Renders the login form and translates backend auth outcomes into UI state.
 *
 * Responsibilities:
 * - maintains the reactive form used by the login template.
 * - triggers the Laravel Sanctum login flow through AuthService.
 * - exposes loading and error state for accessibility-friendly feedback.
 */
export class LoginComponent {
  loginForm: FormGroup;
  isSubmitted = false;
  isLoading = false;
  loginErrorMessage = '';
  errorMessage = '';
  loginError = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.loginForm = this.fb.group({
      identifier: ['', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(8)]],
    });
  }

  /**
   * Clears stale server-side banners as soon as the user edits the form again.
   * This keeps 401/422/429 feedback tied to the last submitted payload only.
   */
  clearSubmitState(): void {
    if (this.isSubmitted) {
      this.isSubmitted = false;
    }
    this.loginError = false;
    this.loginErrorMessage = '';
    this.errorMessage = '';
    this.cdr.detectChanges();
  }

  /**
   * Submits the login form when the payload is valid.
   *
   * Side effects:
   * - marks controls as touched when validation fails.
   * - starts the session-based login flow against Laravel.
   * - navigates to /home on success.
   * - maps backend HTTP errors into stable UI messages for the user and tests.
   */
  onSubmit(): void {
    if (this.isLoading) {
      return;
    }

    this.isSubmitted = true;
    this.loginError = false;
    this.loginErrorMessage = '';
    this.errorMessage = '';

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { identifier, password } = this.loginForm.getRawValue();
    const normalizedIdentifier = String(identifier ?? '').trim();
    this.isLoading = true;

    this.authService.login(normalizedIdentifier, password).subscribe({
      next: () => {
        this.isLoading = false;
        this.router.navigate(['/home']);
      },
      error: (error: HttpErrorResponse) => {
        this.isLoading = false;

        // The SPA mirrors the backend contract so auth/security tests can assert
        // stable messages without duplicating server-side decision logic.
        if (error.status === 401) {
          this.loginError = true;
          this.loginErrorMessage = 'Las credenciales son incorrectas.';
          this.errorMessage = this.loginErrorMessage;
          this.cdr.detectChanges();
          return;
        }
        if (error.status === 429) {
          this.errorMessage = error.error?.message ?? 'Demasiados intentos. Espera un momento e intenta nuevamente.';
          this.loginErrorMessage = this.errorMessage;
          this.cdr.detectChanges();
          return;
        }
        if (error.status === 422) {
          const validationErrors = error.error?.errors;
          if (validationErrors && typeof validationErrors === 'object') {
            const messages = Object.values(validationErrors as Record<string, string[]>).flat();
            if (messages.length > 0) {
              this.errorMessage = messages[0];
              this.loginErrorMessage = this.errorMessage;
              this.cdr.detectChanges();
              return;
            }
          }
          this.errorMessage = 'Hay datos inválidos en el formulario.';
          this.loginErrorMessage = this.errorMessage;
          this.cdr.detectChanges();
          return;
        }
        if (error.status === 419) {
          this.errorMessage = 'Token CSRF inválido. Recarga la página e intenta de nuevo.';
          this.loginErrorMessage = this.errorMessage;
          this.cdr.detectChanges();
          return;
        }
        this.errorMessage = 'No se pudo iniciar sesión. Inténtalo de nuevo.';
        this.loginErrorMessage = this.errorMessage;
        this.cdr.detectChanges();
      },
    });
  }
}

import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AUTH_ROUTES } from '../auth/auth-routes';
import { AuthService, RegisterData } from '../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: false,
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
/**
 * Renders the public registration screen and coordinates SPA-side validation.
 *
 * Responsibilities:
 * - owns the reactive registration form used by the template.
 * - prevents clearly invalid submissions before hitting the backend.
 * - forwards valid payloads to the Sanctum registration flow.
 * - exposes field and banner errors in a way Cypress can assert reliably.
 */
export class Register {
  registerForm: FormGroup;
  isSubmitted = false;
  isLoading = false;
  validationMessage = '';
  registerErrorMessage = '';
  serverErrors: Record<string, string[]> = {};
  showPassword = false;
  showPasswordConfirm = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.registerForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100), Validators.pattern(/^[\p{L}\s]{2,100}$/u)]],
      apellidos: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150), Validators.pattern(/^[\p{L}\s]{2,150}$/u)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
      usuario: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(20), Validators.pattern(/^[a-zA-Z0-9_-]+$/)]],
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(255), Validators.pattern(/^(?=.*[!@#$%^&*(),.?":{}|<>])[A-Z][A-Za-z0-9!@#$%^&*(),.?":{}|<>]{7,}$/)]],
      password_confirmation: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(255)]],
    });
  }

  /**
   * Any new keystroke invalidates the previous submit result so the user does
   * not keep seeing stale validation or server errors for an old payload.
   */
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  togglePasswordConfirmVisibility(): void {
    this.showPasswordConfirm = !this.showPasswordConfirm;
  }

  clearSubmitState(): void {
    if (this.isSubmitted) {
      this.isSubmitted = false;
    }
    this.validationMessage = '';
    this.registerErrorMessage = '';
    this.serverErrors = {};
    this.cdr.detectChanges();
  }

  /**
   * Attempts to create a new user account with the current form payload.
   *
   * Side effects:
   * - marks controls as touched when client-side validation fails.
   * - displays backend validation errors for duplicate usernames or emails.
   * - shows a success alert and redirects to /login after a successful register.
   */
  onSubmit(): void {
    this.isSubmitted = true;
    this.validationMessage = '';
    this.registerErrorMessage = '';
    this.serverErrors = {};

    const passwordsDoNotMatch = this.registerForm.get('password')?.value !== this.registerForm.get('password_confirmation')?.value;

    if (this.registerForm.invalid || passwordsDoNotMatch) {
      this.registerForm.markAllAsTouched();
      this.validationMessage = 'Revisa todos los campos obligatorios.';
      this.cdr.detectChanges();
      return;
    }

    this.isLoading = true;
    const payload = this.registerForm.value as RegisterData;

    this.authService.register(payload).subscribe({
      next: () => {
        this.isLoading = false;
        alert('Usuario creado correctamente');
        this.router.navigate([AUTH_ROUTES.login]);
      },
      error: (error: HttpErrorResponse) => {
        this.isLoading = false;
        if (error.status === 422) {
          // Field errors stay available for stable data-cy selectors in E2E.
          const validationErrors = error.error?.errors;
          if (validationErrors && typeof validationErrors === 'object') {
            this.serverErrors = validationErrors as Record<string, string[]>;
          }
          this.registerErrorMessage = 'Revisa los errores del formulario.';
          this.cdr.detectChanges();
          return;
        }
        if (error.status === 429) {
          this.registerErrorMessage = error.error?.message ?? 'Demasiados intentos de registro. Intenta de nuevo en unos minutos.';
          this.cdr.detectChanges();
          return;
        }
        if (error.status === 419) {
          this.registerErrorMessage = 'Token CSRF invalido. Recarga la pagina e intenta de nuevo.';
          this.cdr.detectChanges();
          return;
        }
        this.registerErrorMessage = 'No se pudo completar el registro. Intentalo de nuevo.';
        this.cdr.detectChanges();
      },
    });
  }
}

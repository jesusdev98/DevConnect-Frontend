import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AUTH_ROUTES } from '../auth/auth-routes';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: false,
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword implements OnInit {
  form: FormGroup;
  isSubmitted = false;
  isLoading = false;
  errorMessage = '';
  showPassword = false;
  showPasswordConfirm = false;
  private token = '';
  private email = '';
  readonly loginRoute = AUTH_ROUTES.login;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.form = this.fb.group({
      password: ['', [
        Validators.required,
        Validators.minLength(8),
        Validators.maxLength(255),
        Validators.pattern(/^(?=.*[!@#$%^&*(),.?":{}|<>])[A-Z][A-Za-z0-9!@#$%^&*(),.?":{}|<>]{7,}$/),
      ]],
      password_confirmation: ['', [Validators.required]],
    });
  }

  ngOnInit(): void {
    this.token = String(this.route.snapshot.queryParamMap.get('token') ?? '');
    this.email = String(this.route.snapshot.queryParamMap.get('email') ?? '');

    if (!this.token || !this.email) {
      this.router.navigate([AUTH_ROUTES.login]);
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  togglePasswordConfirmVisibility(): void {
    this.showPasswordConfirm = !this.showPasswordConfirm;
  }

  onSubmit(): void {
    this.isSubmitted = true;
    this.errorMessage = '';

    const passwordsDoNotMatch =
      this.form.get('password')?.value !== this.form.get('password_confirmation')?.value;

    if (this.form.invalid || passwordsDoNotMatch) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading = true;

    this.authService.resetPassword({
      token: this.token,
      email: this.email,
      password: this.form.value.password,
      password_confirmation: this.form.value.password_confirmation,
    }).subscribe({
      next: () => {
        this.isLoading = false;
        this.router.navigate([AUTH_ROUTES.login], {
          queryParams: { reset: 'ok' },
        });
      },
      error: (error: HttpErrorResponse) => {
        this.isLoading = false;
        if (error.status === 422) {
          this.errorMessage = 'El enlace de recuperación es inválido o ha expirado.';
        } else if (error.status === 429) {
          this.errorMessage = 'Demasiados intentos. Esperá un momento e intentá de nuevo.';
        } else {
          this.errorMessage = 'No se pudo restablecer la contraseña. Intentá de nuevo.';
        }
        this.cdr.detectChanges();
      },
    });
  }
}

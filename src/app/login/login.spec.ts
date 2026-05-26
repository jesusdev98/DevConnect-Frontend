import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';
import { LoginComponent } from './login';
import { AuthService } from '../services/auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authServiceMock: { login: Mock };
  let router: Router;

  beforeEach(async () => {
    authServiceMock = {
      login: vi.fn(),
    };

    await TestBed.configureTestingModule({
      declarations: [LoginComponent],
      imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('crea el componente', () => {
    expect(component).toBeTruthy();
  });

  it('bloquea envío con formulario inválido', () => {
    component.onSubmit();

    expect(authServiceMock.login).not.toHaveBeenCalled();
  });

  it('navega a /home si las credenciales son correctas', async () => {
    authServiceMock.login.mockReturnValue(of({ id: 12, name: 'Usuario' }));
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.loginForm.setValue({
      identifier: '  admin  ',
      password: 'Password@1',
    });

    component.onSubmit();

    expect(authServiceMock.login).toHaveBeenCalledWith('admin', 'Password@1', false);
    expect(component.isLoading).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith(['/home']);
  });

  it('mantiene loading hasta que el login verificado emite next', () => {
    const loginResult$ = new Subject<{ id: number; name: string }>();
    authServiceMock.login.mockReturnValue(loginResult$);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.loginForm.setValue({
      identifier: 'admin',
      password: 'Password@1',
    });

    component.onSubmit();

    expect(component.isLoading).toBe(true);
    expect(navigateSpy).not.toHaveBeenCalled();

    loginResult$.next({ id: 12, name: 'Usuario' });
    loginResult$.complete();

    expect(component.isLoading).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith(['/home']);
  });

  it('ignora un segundo submit mientras el login sigue en curso', () => {
    authServiceMock.login.mockReturnValue(of({ id: 12, name: 'Usuario' }));

    component.loginForm.setValue({
      identifier: 'admin',
      password: 'Password@1',
    });
    component.isLoading = true;

    component.onSubmit();

    expect(authServiceMock.login).not.toHaveBeenCalled();
  });

  it('muestra mensaje genérico si credenciales son inválidas', () => {
    authServiceMock.login.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            error: { message: 'Credenciales incorrectas.' },
          }),
      ),
    );

    component.loginForm.setValue({
      identifier: 'usuario',
      password: 'Password@1',
    });

    component.onSubmit();

    expect(component.errorMessage).toBe('Las credenciales son incorrectas.');
  });

  it('muestra mensaje de throttle cuando recibe 429', () => {
    authServiceMock.login.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 429,
            error: { message: 'Demasiados intentos.' },
          }),
      ),
    );

    component.loginForm.setValue({
      identifier: 'usuario',
      password: 'Password@1',
    });

    component.onSubmit();

    expect(component.errorMessage).toBe('Demasiados intentos.');
  });
});

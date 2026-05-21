import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService, RegisterData } from '../services/auth.service';
import { Register } from './register';

describe('Register', () => {
  let component: Register;
  let fixture: ComponentFixture<Register>;
  let authServiceMock: { register: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(async () => {
    authServiceMock = {
      register: vi.fn(),
    };

    await TestBed.configureTestingModule({
      declarations: [Register],
      imports: [CommonModule, ReactiveFormsModule],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Register);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    await fixture.detectChanges();
  });

  const payload: RegisterData = {
    nombre: 'Ana',
    apellidos: 'Pérez',
    usuario: 'ana_user',
    email: 'ana@example.com',
    password: 'Password@1',
    password_confirmation: 'Password@1',
  };

  it('crea el componente', () => {
    expect(component).toBeTruthy();
  });

  it('bloquea envío con formulario inválido', () => {
    component.onSubmit();

    expect(authServiceMock.register).not.toHaveBeenCalled();
  });

  it('muestra alerta y redirige a login en registro exitoso', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    authServiceMock.register.mockReturnValue(of({ id: 20, name: 'Ana Pérez', email: 'ana@example.com' }));

    component.registerForm.setValue(payload);
    component.onSubmit();

    expect(alertSpy).toHaveBeenCalledWith('Usuario creado correctamente');
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });

  it('muestra errores de validación del servidor (422)', async () => {
    authServiceMock.register.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 422,
      error: { errors: { usuario: ['Este usuario ya existe'] } },
    })));

    component.registerForm.setValue(payload);
    component.onSubmit();

    expect(component.registerErrorMessage).toBe('Revisa los errores del formulario.');
    expect(component.serverErrors['usuario'][0]).toBe('Este usuario ya existe');
  });

  it('muestra mensaje de protección de throttling (429)', async () => {
    authServiceMock.register.mockReturnValue(throwError(() => new HttpErrorResponse({
      status: 429,
      error: { message: 'Demasiados intentos de registro. Intenta de nuevo en unos minutos.' },
    })));

    component.registerForm.setValue(payload);
    component.onSubmit();

    expect(component.registerErrorMessage).toBe('Demasiados intentos de registro. Intenta de nuevo en unos minutos.');
  });
});

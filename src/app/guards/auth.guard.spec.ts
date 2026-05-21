import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AuthGuard } from './auth.guard';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let authServiceMock: { me: ReturnType<typeof vi.fn>; isAuthenticated: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(() => {
    authServiceMock = {
      me: vi.fn(),
      isAuthenticated: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        AuthGuard,
        { provide: AuthService, useValue: authServiceMock },
      ],
    });

    guard = TestBed.inject(AuthGuard);
    router = TestBed.inject(Router);
  });

  it('permite acceso si hay sesión en memoria', async () => {
    authServiceMock.isAuthenticated.mockReturnValue(true);
    authServiceMock.me.mockImplementation(() => {});

    const result = await firstValueFrom(guard.canActivate());
    expect(result).toBe(true);
    expect(authServiceMock.me).not.toHaveBeenCalled();
  });

  it('reconstruye sesión con /auth/me cuando no hay sesión en memoria', async () => {
    authServiceMock.isAuthenticated.mockReturnValue(false);
    authServiceMock.me.mockReturnValue(of({ id: 4, email: 'user@example.com' }));

    const result = await firstValueFrom(guard.canActivate());
    expect(result).toBe(true);
    expect(authServiceMock.me).toHaveBeenCalled();
  });

  it('redirecciona a /login si la sesión no es válida', async () => {
    authServiceMock.isAuthenticated.mockReturnValue(false);
    authServiceMock.me.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));

    const result = await firstValueFrom(guard.canActivate());
    expect(typeof result).toBe('object');
    expect(router.parseUrl('/login').toString()).toBe((result as { toString(): string }).toString());
  });
});

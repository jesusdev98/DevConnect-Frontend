import { TestBed } from '@angular/core/testing';
import { HttpTestingController, HttpClientTestingModule } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { vi } from 'vitest';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  const csrfUrl = `${environment.apiUrl}/sanctum/csrf-cookie`;

  const expectCsrfRequest = () =>
    httpMock.expectOne((req) =>
      req.method === 'GET'
      && req.url === csrfUrl
      && req.params.has('_ts'),
    );

  beforeEach(() => {
    vi.useFakeTimers();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  it('inicia sesion llamando primero al endpoint CSRF y luego a auth/login', () => {
    service.login('  usuario  ', 'Password@1').subscribe((user) => {
      expect(user.id).toBe(3);
      expect(user.username).toBe('usuario');
      expect(service.getCurrentUser()?.id).toBe(3);
    });

    const csrfCall = expectCsrfRequest();
    expect(csrfCall.request.method).toBe('GET');
    expect(csrfCall.request.withCredentials).toBe(true);
    csrfCall.flush({});

    const loginCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/login`);
    expect(loginCall.request.method).toBe('POST');
    expect(loginCall.request.withCredentials).toBe(true);
    expect(loginCall.request.body).toEqual({
      identifier: 'usuario',
      password: 'Password@1',
      remember: false,
    });

    loginCall.flush({
      success: true,
      data: {
        id: 3,
        username: 'usuario',
        email: 'usuario@example.com',
      },
    });

    vi.advanceTimersByTime(100);
    const meCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/me`);
    expect(meCall.request.method).toBe('GET');
    expect(meCall.request.withCredentials).toBe(true);
    meCall.flush({
      success: true,
      data: {
        id: 3,
        username: 'usuario',
        email: 'usuario@example.com',
      },
    });
  });

  it('reutiliza un unico pipeline cuando hay dos login concurrentes', () => {
    const firstResult: number[] = [];
    const secondResult: number[] = [];

    service.login('usuario', 'Password@1').subscribe((user) => firstResult.push(user.id));
    service.login('usuario', 'Password@1').subscribe((user) => secondResult.push(user.id));

    const csrfCall = expectCsrfRequest();
    csrfCall.flush({});

    const loginCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/login`);
    loginCall.flush({
      success: true,
      data: {
        id: 7,
        username: 'usuario',
      },
    });

    vi.advanceTimersByTime(100);
    const meCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/me`);
    meCall.flush({
      success: true,
      data: {
        id: 7,
        username: 'usuario',
      },
    });

    expect(firstResult).toEqual([7]);
    expect(secondResult).toEqual([7]);
  });

  it('usa el usuario de login cuando auth/me verifica sesion pero no devuelve usuario', () => {
    const result: number[] = [];

    service.login('usuario', 'Password@1').subscribe((user) => result.push(user.id));

    const csrfCall = expectCsrfRequest();
    csrfCall.flush({});

    const loginCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/login`);
    loginCall.flush({
      success: true,
      data: {
        id: 8,
        username: 'usuario',
      },
    });

    vi.advanceTimersByTime(100);
    const meCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/me`);
    meCall.flush({
      success: true,
      message: 'Sesion activa.',
      data: null,
    });

    expect(result).toEqual([8]);
    expect(service.getCurrentUser()?.id).toBe(8);
  });

  it('reintenta una vez la verificacion post-login si auth/me devuelve 401 inmediato', () => {
    const result: number[] = [];

    service.login('usuario', 'Password@1').subscribe((user) => result.push(user.id));

    const csrfCall = expectCsrfRequest();
    csrfCall.flush({});

    const loginCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/login`);
    loginCall.flush({
      success: true,
      data: {
        id: 10,
        username: 'usuario',
      },
    });

    vi.advanceTimersByTime(100);
    const firstMeCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/me`);
    firstMeCall.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(result).toEqual([]);
    expect(service.getCurrentUser()).toBeNull();

    vi.advanceTimersByTime(100);
    const retryMeCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/me`);
    retryMeCall.flush({
      success: true,
      data: {
        id: 10,
        username: 'usuario',
      },
    });

    expect(result).toEqual([10]);
    expect(service.getCurrentUser()?.id).toBe(10);
  });

  it('falla login si auth/me devuelve 401 tambien en el unico reintento', () => {
    let errorStatus: number | undefined;

    service.login('usuario', 'Password@1').subscribe({
      next: () => { throw new Error('No debia autenticar.'); },
      error: (error: HttpErrorResponse) => {
        errorStatus = error.status;
      },
    });

    const csrfCall = expectCsrfRequest();
    csrfCall.flush({});

    const loginCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/login`);
    loginCall.flush({
      success: true,
      data: {
        id: 11,
        username: 'usuario',
      },
    });

    vi.advanceTimersByTime(100);
    const firstMeCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/me`);
    firstMeCall.flush({}, { status: 401, statusText: 'Unauthorized' });

    vi.advanceTimersByTime(100);
    const retryMeCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/me`);
    retryMeCall.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(errorStatus).toBe(401);
    expect(service.getCurrentUser()).toBeNull();
  });

  it('ignora una hidratacion antigua que falla despues de un login correcto', () => {
    service.hydrateSession().subscribe();

    const staleHydrationCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/me`);

    service.login('usuario', 'Password@1').subscribe();

    const csrfCall = expectCsrfRequest();
    csrfCall.flush({});

    const loginCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/login`);
    loginCall.flush({
      success: true,
      data: {
        id: 9,
        username: 'usuario',
      },
    });

    vi.advanceTimersByTime(100);
    const loginVerificationCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/me`);
    loginVerificationCall.flush({
      success: true,
      data: {
        id: 9,
        username: 'usuario',
      },
    });

    expect(service.getCurrentUser()?.id).toBe(9);

    staleHydrationCall.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(service.getCurrentUser()?.id).toBe(9);
  });

  it('registra usuarios y normaliza la respuesta del backend', () => {
    service.register({
      nombre: 'Ana',
      apellidos: 'Perez',
      usuario: 'ana_user',
      email: 'ana@example.com',
      password: 'Password@1',
      password_confirmation: 'Password@1',
    }).subscribe((user) => {
      expect(user.id).toBe(10);
      expect(user.email).toBe('ana@example.com');
    });

    const csrfCall = expectCsrfRequest();
    expect(csrfCall.request.method).toBe('GET');
    expect(csrfCall.request.withCredentials).toBe(true);
    csrfCall.flush({});

    const registerCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/register`);
    expect(registerCall.request.method).toBe('POST');
    expect(registerCall.request.withCredentials).toBe(true);
    registerCall.flush({
      success: true,
      data: {
        user: {
          id: 10,
          name: 'Ana Perez',
          username: 'ana_user',
          email: 'ana@example.com',
        },
      },
    });
  });

  it('actualiza el estado local de usuario tras me/logout', () => {
    service.me().subscribe((user) => {
      expect(service.getCurrentUser()?.id).toBe(15);
      expect(user.email).toBe('sesion@example.com');
    });

    const meCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/me`);
    meCall.flush({
      success: true,
      data: {
        id: 15,
        email: 'sesion@example.com',
        username: 'sesion_user',
      },
    });

    expect(service.getCurrentUser()?.id).toBe(15);

    service.logout().subscribe((response) => {
      expect(response).toBeTruthy();
      expect(service.getCurrentUser()).toBeNull();
    });

    const logoutCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/logout`);
    expect(logoutCall.request.method).toBe('POST');
    logoutCall.flush({ success: true, message: 'Sesion cerrada.' });
  });

  it('limpia el estado local al cerrar sesion aunque falle la peticion', () => {
    service.me().subscribe((user) => {
      expect(user.email).toBe('sesion@example.com');
      expect(service.getCurrentUser()?.id).toBe(15);
    });

    const meCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/me`);
    meCall.flush({
      success: true,
      data: {
        id: 15,
        email: 'sesion@example.com',
        username: 'sesion_user',
      },
    });

    service.logout().subscribe({
      error: () => { /* finalize handles clearing the user */ },
    });

    const logoutCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/logout`);
    logoutCall.flush({}, { status: 500, statusText: 'Server Error' });

    expect(service.getCurrentUser()).toBeNull();
  });

  it('propaga un error de rate limit', () => {
    service.login('usuario', 'Password@1').subscribe({
      next: () => { throw new Error('No debia entrar a success.'); },
      error: (error: HttpErrorResponse) => {
        expect(error.status).toBe(429);
      },
    });

    const csrfCall = expectCsrfRequest();
    csrfCall.flush({});

    const loginCall = httpMock.expectOne(`${environment.apiUrl}/api/auth/login`);
    loginCall.flush({ message: 'Too many requests' }, { status: 429, statusText: 'Too Many Requests' });
  });
});

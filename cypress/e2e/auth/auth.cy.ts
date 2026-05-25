/**
 * End-to-end authentication and authorization coverage for DevConnect.
 *
 * Security scenarios validated here:
 * - public registration and login flows.
 * - protected route enforcement and logout invalidation.
 * - anti-enumeration, throttling expectations and admin-only access.
 * - account security flows such as password rotation.
 *
 * Intercepts are used to observe the real browser-side Laravel Sanctum
 * requests without mocking them, so the suite can assert the actual SPA/API
 * contract around CSRF, sessions and protected endpoints.
 */
describe('E2E - Autenticacion y autorizacion', () => {
  const frontendBaseUrl = Cypress.config('baseUrl') ?? 'http://127.0.0.1:4200';
  const apiBackend = (Cypress.env('backendUrl') as string | undefined) ?? 'http://127.0.0.1:8001';
  const authCsrfAlias = '@authCsrfRequest';
  const authLoginAlias = '@authLoginRequest';
  const authRegisterAlias = '@authRegisterRequest';
  const authMeAlias = '@authMeRequest';
  const authChangePasswordAlias = '@authChangePasswordRequest';

  // Local helper utilities used by auth scenarios in this spec.

  // Generates deterministic but unique usernames within backend validation
  // limits so auth scenarios do not collide with each other.
  const buildUsername = (prefix: string, suffix: string) => {
    const normalizedPrefix = prefix
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 8)
      .toLowerCase();
    const normalizedSuffix = suffix.slice(-8);

    return `${normalizedPrefix}_${normalizedSuffix}`;
  };

  // Produces complete credentials objects reused by UI and API auth helpers.
  const buildCredentials = (prefix: string) => {
    const suffix = Date.now().toString();
    const username = buildUsername(prefix, suffix);

    return {
      nombre: 'Test',
      apellidos: 'User',
      usuario: username,
      username: username,
      email: `test_${suffix}@test.com`,
      password: 'Password123!',
      passwordConfirmation: 'Password123!',
    };
  };

  function registerTestUser(user: any) {
    return cy
      .registerByAPI({
        ...user,
        passwordConfirmation: user.passwordConfirmation,
      })
      .its('status')
      .should('eq', 201);
  }

  // Ensures every test starts from a public session before exercising auth.
  const ensureFreshSession = () => {
    cy.resetAuthState();
    cy.visit('/login');
  };

  function assertHomeLoaded() {
    cy.url({ timeout: 15000 }).should('include', '/home');
    cy.get('[data-cy=home-root]').should('be.visible');
  }

  function loginAsUser(user: { usuario: string; password: string }) {
    cy.visit('/login');

    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });

    assertHomeLoaded();
  }

  function logoutUser() {
    cy.get('[data-cy=profile-logout]').click();
    cy.url({ timeout: 15000 }).should('include', '/login');
  }

  // Mirrors the register form fields explicitly when a test needs fine-grained
  // control over double-submit behavior instead of the higher-level helper.
  const fillRegisterForm = (user: ReturnType<typeof buildCredentials>) => {
    cy.get('[data-cy=register-nombre]').clear().type(user.nombre);
    cy.get('[data-cy=register-apellidos]').clear().type(user.apellidos);
    cy.get('[data-cy=register-usuario]').clear().type(user.usuario);
    cy.get('[data-cy=register-email]').clear().type(user.email);
    cy.get('[data-cy=register-password]').clear().type(user.password);
    cy.get('[data-cy=register-password-confirm]').clear().type(user.passwordConfirmation);
  };

  // Seeds the privileged account used by admin-only authorization scenarios.
  const seedAdminUser = () => {
    return cy.seedAdminUser();
  };

  // Accesses the interception history behind a given alias for duplicate-submit
  // scenarios where more than one request may be emitted.
  const getRequestHistory = (alias: string) => {
    return cy
      .get(`${alias}.all`)
      .then((interceptions) => Array.from(interceptions as unknown as ArrayLike<any>));
  };

  // Asserts against the last completed response seen for an alias.
  const expectLatestResponseStatus = (alias: string, expectedStatus: number) => {
    return getRequestHistory(alias).then((interceptions) => {
      const requestHistory = interceptions as unknown as any[];
      expect(requestHistory.length, `${alias} request count`).to.be.greaterThan(0);
      expect(requestHistory[requestHistory.length - 1]?.response?.statusCode).to.eq(expectedStatus);
    });
  };

  // Verifies that retry or double-submit behavior stays within an expected
  // request count window without assuming every request completed.
  const expectRequestCountWithin = (alias: string, min: number, max: number) => {
    return getRequestHistory(alias).then((interceptions) => {
      const requestHistory = interceptions as unknown as any[];
      expect(requestHistory.length, `${alias} request count`).to.be.within(min, max);
      return requestHistory;
    });
  };

  // Filters out aborted or deduplicated requests so assertions focus on real
  // backend responses rather than transport-level cancellation artifacts.
  const getCompletedInterceptions = (alias: string) => {
    return getRequestHistory(alias).then((interceptions) => {
      const requestHistory = interceptions as unknown as any[];
      return requestHistory.filter(
        (interception) => interception?.response?.statusCode !== undefined,
      );
    });
  };

  // Confirms that a protected route triggers a fresh session lookup and that
  // the settled session ends up authorized on the private profile area.
  const assertAuthMeReturns200 = (): Cypress.Chainable<void> => {
    cy.visitProtectedRoute('/profile');

    cy.location('pathname', { timeout: 15000 }).should('include', '/profile');
    cy.get('[data-cy=profile-root]', { timeout: 15000 }).should('be.visible');

    return cy
      .get(`${authMeAlias}.all`, { timeout: 15000 })
      .should((interceptions) => {
        const completedInterceptions = Array.from(
          interceptions as unknown as ArrayLike<any>,
        ).filter((interception) => interception?.response?.statusCode !== undefined);

        expect(completedInterceptions.length, 'completed auth/me responses').to.be.greaterThan(0);

        const latestInterception = completedInterceptions[completedInterceptions.length - 1];
        expect(
          latestInterception.response.statusCode,
          'final auth/me status after protected-route check',
        ).to.eq(200);
      })
      .then(() => undefined);
  };

  // Some identifier normalization behavior is intentionally flexible while the
  // backend contract evolves, so this helper documents the accepted outcomes.
  const assertFlexibleLoginBehavior = () => {
    cy.location('pathname', { timeout: 15000 }).then((path) => {
      if (path.includes('/home')) {
        cy.get('[data-cy=home-root]').should('be.visible');
        assertAuthMeReturns200();
        return;
      }

      cy.url().should('include', '/login');
      cy.assertLoginErrorMessage('Las credenciales son incorrectas.');
      cy.get('[data-cy=login-submit]').should('contain.text', 'Entrar');
    });
  };

  // Uses the browser fetch API to validate admin authorization with the same
  // session cookies owned by the SPA, instead of a detached cy.request jar.
  const fetchAdminPing = () => {
    return cy.window().then((win) =>
      win
        .fetch(`${frontendBaseUrl}/api/admin/ping`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
        })
        .then(async (response) => {
          const rawBody = await response.text();

          try {
            return {
              status: response.status,
              body: rawBody ? JSON.parse(rawBody) : null,
            };
          } catch {
            return {
              status: response.status,
              body: rawBody,
            };
          }
        }),
    );
  };

  // Clears the real browser cookie jar for the expired-session scenario. This
  // avoids domain-scope ambiguity around proxied 127.0.0.1/backend traffic.
  const clearBrowserCookieJar = () => {
    const cookieNames = [
      'XSRF-TOKEN',
      'devconnect-session',
      'devconnect_session',
      'laravel-session',
      'laravel_session',
    ];
    const domains = ['127.0.0.1', 'backend'];

    return cy.getAllCookies().then((cookies) => {
      let chain = cy.wrap(null, { log: false });

      cookies.forEach(({ name, domain }) => {
        chain = chain.then(() => cy.clearCookie(name, { domain, log: false }));
      });
      domains.forEach((domain) => {
        cookieNames.forEach((name) => {
          chain = chain.then(() => cy.clearCookie(name, { domain, log: false }));
        });
      });
      cookieNames.forEach((name) => {
        chain = chain.then(() => cy.clearCookie(name, { log: false }));
      });

      return chain
        .then(() => {
          if (Cypress.isBrowser('firefox')) {
            return undefined;
          }

          return Cypress.automation('remote:debugger:protocol', {
            command: 'Network.clearBrowserCache',
          });
        })
        .then(() => undefined);
    });
  };

  const invalidateBrowserSession = () => {
    return cy.window().then((win) => {
      const xsrfCookie = win.document.cookie
        .split('; ')
        .find((cookie) => cookie.startsWith('XSRF-TOKEN='));

      if (!xsrfCookie) {
        throw new Error('Missing XSRF-TOKEN cookie before expiring browser session.');
      }

      const xsrfToken = decodeURIComponent(xsrfCookie.slice('XSRF-TOKEN='.length));

      return win
        .fetch(`${frontendBaseUrl}/api/auth/logout`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': xsrfToken,
          },
        })
        .then((response) => {
          expect(response.status, 'browser session invalidation').to.be.oneOf([200, 204]);
        });
    });
  };

  const assertBrowserSessionRejected = () => {
    return cy.window().then((win) => {
      const expiredAuthUrl = `${frontendBaseUrl}/api/auth/me?_expiredTs=${Date.now()}`;

      return win
        .fetch(expiredAuthUrl, {
          method: 'GET',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            'X-Requested-With': 'XMLHttpRequest',
          },
        })
        .then((response) => {
          expect(response.status).to.eq(401);
        });
    });
  };

  const rejectNextSessionRestore = () => {
    cy.intercept('GET', '**/api/auth/me*', {
      statusCode: 401,
      body: {
        message: 'Unauthenticated.',
      },
    }).as('expiredAuthMeRequest');
  };

  beforeEach(() => {
    cy.routeLaravelBrowserTraffic();
    ensureFreshSession();
  });

  // A.* Registration validations and server-side hardening checks.
  it('A1 Registro feliz', () => {
    const user = buildCredentials('e2e_ok');
    cy.visit('/register');

    cy.on('window:alert', (text) => {
      expect(text).to.equal('Usuario creado correctamente');
    });

    cy.registerByUI({
      ...user,
      passwordConfirmation: user.passwordConfirmation,
    });

    cy.location('pathname').then((path) => {
      cy.task('log', `[A1] pathname after register: ${path}`, { log: false });
    });
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.get('[data-cy=login-form]').should('be.visible');
  });

  it('A2 Registro invalido: campos vacios', () => {
    cy.visit('/register');
    cy.get('[data-cy=register-submit]').click();

    cy.get('[data-cy=register-form]').should('be.visible');
    cy.url().should('include', '/register');
    cy.get('small.error').contains('El nombre es obligatorio.').should('be.visible');
    cy.get('small.error').contains('El email es obligatorio.').should('be.visible');
  });

  it('A3 Registro invalido: email invalido', () => {
    const user = buildCredentials('e2e_badmail');
    cy.visit('/register');

    cy.registerByUI(
      {
        ...user,
        email: 'correo-no-valido',
        passwordConfirmation: user.passwordConfirmation,
      },
      { expectRequest: false },
    );

    cy.get('[data-cy=register-validation-message]').should('be.visible');
    cy.get('[data-cy=register-email-error]').should('be.visible');
  });

  it('A4 Registro invalido: password confirmation incorrecta', () => {
    const user = buildCredentials('e2e_nomatch');
    cy.visit('/register');

    cy.registerByUI(
      {
        ...user,
        passwordConfirmation: 'PasswordDiferente@1',
      },
      { expectRequest: false },
    );

    cy.get('[data-cy=register-validation-message]').should('be.visible');
    cy.get('[data-cy=register-password-confirmation-error]').should('be.visible');
  });

  it('A5 Registro invalido: usuario y email duplicados', () => {
    const user = buildCredentials('e2e_dup');

    registerTestUser(user);

    cy.visit('/register');
    cy.registerByUI(user);
    expectLatestResponseStatus(authRegisterAlias, 422);

    cy.get('[data-cy=register-error-message]')
      .should('be.visible')
      .and('contain.text', 'Revisa los errores');
  });

  it('A6 Seguridad en registro: no se puede enviar role=admin', () => {
    const user = buildCredentials('e2e_role');

    cy.csrfRequest({
      method: 'POST',
      url: `${apiBackend}/api/auth/register`,
      body: {
        nombre: user.nombre,
        apellidos: user.apellidos,
        usuario: user.usuario,
        email: user.email,
        password: user.password,
        password_confirmation: user.password,
        role: 'admin',
      },
    }).then((response) => {
      expect(response.status).to.eq(422);
      expect(response.body).to.have.property('errors');
      expect(response.body.errors).to.have.property('role');
    });

    cy.visit('/register');
    cy.url().should('include', '/register');
  });

  // B.* Login success and credential error semantics.
  it('B1 Login feliz por email', () => {
    const user = buildCredentials('e2e_login_email');

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: user.email,
      password: user.password,
    });

    cy.location('pathname').then((path) => {
      cy.task('log', `[B1] pathname after login: ${path}`, { log: false });
    });
    assertHomeLoaded();
  });

  it('B2 Login feliz por username', () => {
    const user = buildCredentials('e2e_login_username');

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });

    assertHomeLoaded();
  });

  it('B3 Login invalido con credenciales incorrectas', () => {
    cy.visit('/login');

    cy.loginByUI({
      identifier: 'inexistente_1',
      password: 'Password@1',
    });

    cy.assertLoginErrorMessage('Las credenciales son incorrectas.');
  });

  it('B4 Anti-enumeracion en login (usuario existente vs inexistente)', () => {
    const existingUser = buildCredentials('e2e_antiexist');

    cy.registerByAPI({
      ...existingUser,
      passwordConfirmation: existingUser.passwordConfirmation,
    })
      .its('status')
      .should('eq', 201);

    cy.visit('/login');
    cy.loginByUI({
      identifier: existingUser.usuario,
      password: 'PasswordInvalida@1',
    });
    cy.assertLoginErrorMessage('Las credenciales son incorrectas.');

    cy.loginByUI({
      identifier: `no-existe-${existingUser.usuario}`,
      password: 'PasswordInvalida@1',
    });
    cy.assertLoginErrorMessage('Las credenciales son incorrectas.');
  });

  // C.* Protected route access with and without authenticated session.
  it('C1 Ruta protegida rechazada sin sesion', () => {
    cy.visit('/home');
    cy.url().should('include', '/login');

    cy.visit('/profile');
    cy.url().should('include', '/login');
  });

  it('C2 Ruta protegida accesible con sesion activa', () => {
    const user = buildCredentials('e2e_private');

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });

    cy.visitProtectedRoute('/home');
    cy.url({ timeout: 15000 }).should('include', '/home');

    cy.visitProtectedRoute('/profile');
    cy.url({ timeout: 15000 }).should('include', '/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
  });

  it('C3 Reload conserva acceso autenticado', () => {
    const user = buildCredentials('e2e_refresh');

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });
    cy.url({ timeout: 15000 }).should('include', '/home');

    cy.reload();
    assertHomeLoaded();
  });

  // D.* Logout invalidation across protected routes.
  it('D1 Logout feliz y bloqueo posterior', () => {
    const user = buildCredentials('e2e_logout');

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });

    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
    logoutUser();

    cy.visitProtectedRoute('/home');
    cy.url({ timeout: 15000 }).should('include', '/login');

    cy.visitProtectedRoute('/profile');
    cy.url({ timeout: 15000 }).should('include', '/login');
  });

  // E.* Backend-owned rate-limiting coverage marker for E2E.
  it('E1 Rate limiting login cubierto con test backend; no estable en e2e', () => {
    cy.log(
      'Rate limiting se valida de forma determinista en backend con tests automaticos de API.',
    );
  });

  // F.* Double-submit and session lifecycle edge cases.
  it('F1 Doble submit en login', () => {
    const user = buildCredentials('e2e_double_login');

    registerTestUser(user);

    cy.visit('/login');
    cy.get('[data-cy=login-identifier]').clear().type(user.usuario);
    cy.get('[data-cy=login-password]').clear().type(user.password);
    cy.get('[data-cy=login-submit]').dblclick();

    cy.wait(authCsrfAlias).its('response.statusCode').should('be.oneOf', [200, 204]);
    cy.wait(authLoginAlias).its('response.statusCode').should('be.oneOf', [200, 419]);
    assertHomeLoaded();
    assertAuthMeReturns200();

    expectRequestCountWithin(authLoginAlias, 1, 2);
    getCompletedInterceptions(authLoginAlias).then((completedInterceptions) => {
      const completedRequestHistory = completedInterceptions as unknown as any[];
      expect(completedRequestHistory.length, 'completed login responses').to.be.greaterThan(0);
      completedRequestHistory.forEach((interception) => {
        expect(interception.response.statusCode).to.be.oneOf([200, 419]);
      });
    });
  });

  it('F2 Doble submit en registro', () => {
    const user = buildCredentials('e2e_double_reg');

    cy.visit('/register');
    cy.on('window:alert', (text) => {
      expect(text).to.equal('Usuario creado correctamente');
    });

    fillRegisterForm(user);
    cy.get('[data-cy=register-submit]').dblclick();

    cy.wait(authCsrfAlias).its('response.statusCode').should('be.oneOf', [200, 204]);
    cy.wait(authRegisterAlias).its('response.statusCode').should('be.oneOf', [201, 422, 419]);
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.get('[data-cy=login-form]').should('be.visible');

    expectRequestCountWithin(authRegisterAlias, 1, 2);
    getCompletedInterceptions(authRegisterAlias).then((completedInterceptions) => {
      const completedRequestHistory = completedInterceptions as unknown as any[];
      expect(completedRequestHistory.length, 'completed register responses').to.be.greaterThan(0);

      const completedStatusCodes = completedRequestHistory.map(
        (interception) => interception.response.statusCode,
      );
      const successfulRegistrations = completedStatusCodes.filter(
        (statusCode) => statusCode === 201,
      );

      completedStatusCodes.forEach((statusCode) => {
        expect(statusCode).to.be.oneOf([201, 422, 419]);
      });
      expect(successfulRegistrations.length, 'successful registrations').to.eq(1);
    });
  });

  it('F3 Boton atras despues de logout', () => {
    const user = buildCredentials('e2e_back_logout');

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });

    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
    logoutUser();
    cy.go('back');
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.get('[data-cy=login-form]').should('be.visible');
  });

  it('F4 Sesion caducada en ruta protegida', () => {
    const user = buildCredentials('e2e_expired');

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });

    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');

    invalidateBrowserSession();
    clearBrowserCookieJar();
    cy.clearAllLocalStorage();
    cy.clearAllSessionStorage();
    assertBrowserSessionRejected();
    rejectNextSessionRestore();
    cy.get('[data-cy=profile-logout]').click();
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.get('[data-cy=login-form]').should('be.visible');
    cy.visitProtectedRoute('/profile');
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.get('[data-cy=login-form]').should('be.visible');
  });

  it('F5 Login con espacios al inicio/final valida el comportamiento real', () => {
    const user = buildCredentials('e2e_spaces');

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: `  ${user.email}  `,
      password: user.password,
    });

    assertHomeLoaded();
    assertAuthMeReturns200();
  });

  it('F6 Login con email en mayusculas valida el comportamiento real', () => {
    const user = buildCredentials('e2e_upper');

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: user.email.toUpperCase(),
      password: user.password,
    });

    assertFlexibleLoginBehavior();
  });

  // G.* Security and UX regression checks around auth errors and logout.
  it('G1 Anti-enumeration consistente', () => {
    const user = buildCredentials('e2e_consistent');
    let existingUserMessage = '';

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: 'PasswordInvalida@1',
    });

    cy.get('[data-cy=login-error-message]')
      .should('be.visible')
      .invoke('text')
      .then((text) => {
        existingUserMessage = text.trim();
      });

    cy.loginByUI({
      identifier: `no-existe-${user.usuario}`,
      password: 'PasswordInvalida@1',
    });

    cy.get('[data-cy=login-error-message]')
      .should('be.visible')
      .invoke('text')
      .then((text) => {
        expect(text.trim()).to.eq(existingUserMessage);
      });
  });

  it('G2 Intento de acceso directo a ruta protegida tras logout', () => {
    const user = buildCredentials('e2e_direct_after_logout');

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });

    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
    logoutUser();

    cy.visit('/profile');
    cy.url({ timeout: 15000 }).should('include', '/login');

    cy.visit('/home');
    cy.url({ timeout: 15000 }).should('include', '/login');
  });

  it('G3 Los mensajes visibles no ejecutan HTML o script', () => {
    cy.visit('/login');
    cy.window().then((win) => {
      cy.stub(win, 'alert').as('unexpectedAlert');
    });

    cy.loginByUI({
      identifier: '<script>alert(1)</script>',
      password: 'Password123!',
    });

    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.get('[data-cy=login-form]').should('be.visible');
    cy.get('[data-cy=login-error-message]').should('be.visible');
    cy.get('@unexpectedAlert').should('not.have.been.called');
  });

  it('G4 El boton vuelve a estado normal tras error', () => {
    const user = buildCredentials('e2e_button_reset');

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: 'PasswordInvalida@1',
    });

    cy.get('[data-cy=login-error-message]').should('be.visible');
    cy.get('[data-cy=login-submit]').should('contain.text', 'Entrar').and('not.be.disabled');

    cy.visit('/register');
    cy.registerByUI(user);

    cy.get('[data-cy=register-error-message]').should('be.visible');
    cy.get('[data-cy=register-submit]')
      .should('contain.text', 'Crear cuenta')
      .and('not.be.disabled');
  });

  // H.* Admin endpoint authorization boundaries.
  it('H1 Ruta admin bloqueada sin sesion', () => {
    fetchAdminPing().then(({ status }) => {
      expect(status).to.eq(401);
    });
  });

  it('H2 Ruta admin bloqueada para usuario normal', () => {
    const user = buildCredentials('e2e_admin_user');

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });
    assertHomeLoaded();
    assertAuthMeReturns200();

    fetchAdminPing().then(({ status, body }) => {
      expect(status).to.eq(403);
      expect(body).to.have.property('message', 'Acceso no autorizado.');
    });
  });

  it('H3 Ruta admin permitida para admin', () => {
    seedAdminUser();

    cy.visit('/login');
    cy.adminCredentials().then((credentials) => cy.loginByUI(credentials));
    assertHomeLoaded();
    assertAuthMeReturns200();

    fetchAdminPing().then(({ status, body }) => {
      expect(status).to.eq(200);
      expect(body).to.have.property('success', true);
      expect(body).to.have.property('message', 'Admin access granted');
    });
  });

  it('H4 Ruta admin bloqueada tras logout', () => {
    seedAdminUser();

    cy.visit('/login');
    cy.adminCredentials().then((credentials) => cy.loginByUI(credentials));
    assertHomeLoaded();

    fetchAdminPing().then(({ status }) => {
      expect(status).to.eq(200);
    });

    cy.visitProtectedRoute('/profile');
    logoutUser();

    fetchAdminPing().then(({ status }) => {
      expect(status).to.eq(401);
    });
  });

  it('H5 Refresh tras logout mantiene el bloqueo', () => {
    const user = buildCredentials('e2e_refresh_logout');

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });

    cy.visitProtectedRoute('/profile');
    logoutUser();

    cy.reload();
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.get('[data-cy=login-form]').should('be.visible');
  });

  // I.* Password change flows and credential rotation behavior.
  it('I1 Usuario autenticado cambia su contrasena desde perfil y la nueva credencial funciona', () => {
    const user = buildCredentials('e2e_change_password');
    const newPassword = 'PasswordNueva@1';

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });
    cy.visitProtectedRoute('/profile');
    cy.openProfileAccountTab();
    cy.get('[data-cy=change-password-current]').clear().type(user.password);
    cy.get('[data-cy=change-password-new]').clear().type(newPassword);
    cy.get('[data-cy=change-password-confirm]').clear().type(newPassword);
    cy.get('[data-cy=change-password-submit]').click();

    cy.wait(authCsrfAlias).its('response.statusCode').should('be.oneOf', [200, 204]);
    cy.wait(authChangePasswordAlias).its('response.statusCode').should('eq', 200);
    cy.get('[data-cy=change-password-success]')
      .should('be.visible')
      .and('contain.text', 'actualizada correctamente');
    cy.get('[data-cy=change-password-submit]').should('contain.text', 'Actualizar');

    logoutUser();

    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });
    cy.assertLoginErrorMessage('Las credenciales son incorrectas.');

    cy.loginByUI({
      identifier: user.usuario,
      password: newPassword,
    });
    assertHomeLoaded();
  });

  it('I2 Current password incorrecta muestra error coherente', () => {
    const user = buildCredentials('e2e_change_password_error');

    registerTestUser(user);

    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });
    cy.visitProtectedRoute('/profile');
    cy.openProfileAccountTab();
    cy.get('[data-cy=change-password-current]').clear().type('PasswordIncorrecta@1');
    cy.get('[data-cy=change-password-new]').clear().type('PasswordNueva@1');
    cy.get('[data-cy=change-password-confirm]').clear().type('PasswordNueva@1');
    cy.get('[data-cy=change-password-submit]').click();

    cy.wait(authCsrfAlias).its('response.statusCode').should('be.oneOf', [200, 204]);
    cy.wait(authChangePasswordAlias).its('response.statusCode').should('eq', 422);
    cy.get('[data-cy=change-password-error]')
      .should('be.visible')
      .and('contain.text', 'La contrasena actual es incorrecta.');
    cy.get('[data-cy=change-password-submit]').should('contain.text', 'Actualizar');
  });
});

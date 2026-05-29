/**
 * Shared Cypress commands for DevConnect authentication and authorization E2E.
 *
 * Why these helpers exist:
 * - keep specs focused on user-visible security scenarios instead of plumbing.
 * - centralize CSRF/session handling required by Laravel Sanctum.
 * - proxy browser-side 127.0.0.1 traffic to the backend listener used by
 *   direct cy.request calls without changing SPA behavior.
 */
const DEFAULT_FRONTEND_URL = 'http://127.0.0.1:4200';
const DEFAULT_API_BACKEND_URL = 'http://127.0.0.1:8001';
const ACCEPTED_CSRF_STATUSES = [200, 204];
const ACCEPTED_LOGOUT_STATUSES = [200, 204, 401, 419];
const AUTH_CSRF_ALIAS = 'authCsrfRequest';
const AUTH_LOGIN_ALIAS = 'authLoginRequest';
const AUTH_REGISTER_ALIAS = 'authRegisterRequest';
const AUTH_ME_ALIAS = 'authMeRequest';
const AUTH_CHANGE_PASSWORD_ALIAS = 'authChangePasswordRequest';
const AUTH_PROFILE_UPDATE_ALIAS = 'authProfileUpdateRequest';
const ADMIN_DELETE_USER_ALIAS = 'adminDeleteUser';
const CONTENT_CREATE_POST_ALIAS = 'contentCreatePost';
const CONTENT_CREATE_COMMENT_ALIAS = 'contentCreateComment';
const CONTENT_TOGGLE_POST_LIKE_ALIAS = 'contentTogglePostLike';
const CONTENT_TOGGLE_COMMENT_LIKE_ALIAS = 'contentToggleCommentLike';
const ME_ROUTE_PATH = '/api/auth/me';
const LOGIN_ROUTE_PATH = '/api/auth/login';
const REGISTER_ROUTE_PATH = '/api/auth/register';
const PROFILE_ROUTE_PATH = '/api/auth/me/profile';
const CHANGE_PASSWORD_ROUTE_PATH = '/api/auth/change-password';
const ADMIN_USERS_ROUTE_PREFIX = '/api/admin/users/';
const CSRF_ROUTE_PATH = '/sanctum/csrf-cookie';
const UI_REQUEST_TIMEOUT = 15000;

type CsrfRequestOptions = {
  method: string;
  url: string;
  body?: any;
  headers?: Record<string, string>;
  failOnStatusCode?: boolean;
  withCredentials?: boolean;
};

type RegisterPayload = {
  nombre: string;
  apellidos: string;
  usuario?: string;
  username?: string;
  email: string;
  password: string;
  passwordConfirmation: string;
};

type LoginPayload = {
  identifier: string;
  password: string;
};

type UiSubmitOptions = {
  expectRequest?: boolean;
};

type CreatePostUiPayload = {
  title: string;
  content: string;
  tagName?: string;
};

type PostsBootstrapWaitOptions = {
  waitPosts?: boolean;
  postsAlias?: string;
};

declare global {
  namespace Cypress {
    interface Chainable {
      csrfRequest(options: CsrfRequestOptions): Chainable<any>;
      resetAuthState(): Chainable<void>;
      visitProtectedRoute(path: string): Chainable<void>;
      loginByUI(payload: LoginPayload, options?: UiSubmitOptions): Chainable<void>;
      registerByUI(payload: RegisterPayload, options?: UiSubmitOptions): Chainable<void>;
      registerByAPI(payload: RegisterPayload): Chainable<any>;
      loginByAPI(payload: LoginPayload): Chainable<any>;
      adminCredentials(): Chainable<LoginPayload>;
      seedAdminUser(): Chainable<void>;
      assertLoginErrorMessage(message: string): Chainable<JQuery<HTMLElement>>;
      apiLogout(): Chainable<void>;
      routeLaravelBrowserTraffic(): Chainable<void>;
      openProfileAccountTab(): Chainable<void>;
      createPostByUI(payload: CreatePostUiPayload): Chainable<void>;
      waitForPostsBootstrap(options?: PostsBootstrapWaitOptions): Chainable<void>;
    }
  }
}

type CsrfContext = {
  cookieHeader: string;
  xsrfToken: string;
};

const resolveFrontendBaseUrl = (): string => Cypress.config('baseUrl') ?? DEFAULT_FRONTEND_URL;

/**
 * Derives the backend origin used by the browser during real SPA requests.
 */
const resolveBrowserBackendUrl = (): string => {
  const configuredBrowserBackendUrl = Cypress.env('browserBackendUrl');
  if (typeof configuredBrowserBackendUrl === 'string' && configuredBrowserBackendUrl.length > 0) {
    return configuredBrowserBackendUrl;
  }

  return resolveFrontendBaseUrl();
};

/**
 * Resolves the backend origin used by direct cy.request calls.
 */
const resolveApiBackendUrl = (): string => {
  const configuredBackendUrl = Cypress.env('backendUrl');
  return typeof configuredBackendUrl === 'string' && configuredBackendUrl.length > 0
    ? configuredBackendUrl
    : DEFAULT_API_BACKEND_URL;
};

const resolveAdminSeedCommand = (): string => {
  const configuredCommand = Cypress.env('adminSeedCommand');
  return typeof configuredCommand === 'string' ? configuredCommand.trim() : '';
};

const resolveRequiredCypressEnv = (name: string): string => {
  const value = Cypress.env(name);

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `Missing Cypress env "${name}". Configure CYPRESS_${name} for admin E2E specs.`,
    );
  }

  return value.trim();
};

Cypress.Commands.add('adminCredentials', (): Cypress.Chainable<LoginPayload> => {
  return cy.wrap(
    {
      identifier: resolveRequiredCypressEnv('adminEmail'),
      password: resolveRequiredCypressEnv('adminPassword'),
    },
    { log: false },
  );
});

Cypress.Commands.add('seedAdminUser', (): Cypress.Chainable<void> => {
  const command = resolveAdminSeedCommand();

  if (!command) {
    cy.log('Admin seed command not configured; assuming the backend test user already exists.');
    return cy.wrap(null, { log: false }).then(() => undefined);
  }

  return cy
    .exec(command, { failOnNonZeroExit: true })
    .then((result) => {
      expect(result.exitCode ?? 0).to.eq(0);
    })
    .then(() => undefined);
});

/**
 * Emits compact network diagnostics for auth aliases when E2E waits complete.
 */
const logInterceptResult = (alias: string, interception: any): Cypress.Chainable<void> => {
  const requestUrl = interception.request.url;
  const responseStatus = interception.response?.statusCode ?? 'NO_RESPONSE';

  return cy
    .task('log', `[${alias}] ${interception.request.method} ${requestUrl} -> ${responseStatus}`, {
      log: false,
    })
    .then(() => undefined);
};

/**
 * Records the current SPA pathname before and after auth form submissions.
 */
const logPathname = (label: string): Cypress.Chainable<void> => {
  return cy
    .location('pathname')
    .then((path) =>
      cy.task('log', `[${label}] pathname=${path}`, { log: false }).then(() => undefined),
    );
};

/**
 * Maps browser-side auth traffic to stable aliases consumed by the suite.
 *
 * These aliases intentionally represent security-relevant checkpoints:
 * - CSRF bootstrap before mutating requests.
 * - login/register POST attempts.
 * - session rehydration through /api/auth/me.
 * - password rotation requests from the profile area.
 */
const resolveBrowserAuthAlias = (method: string, url: string): string | undefined => {
  const pathname = new URL(url).pathname;
  const normalizedMethod = method.toUpperCase();

  if (normalizedMethod === 'GET' && pathname === CSRF_ROUTE_PATH) {
    return AUTH_CSRF_ALIAS;
  }

  if (normalizedMethod === 'POST' && pathname === LOGIN_ROUTE_PATH) {
    return AUTH_LOGIN_ALIAS;
  }

  if (normalizedMethod === 'POST' && pathname === REGISTER_ROUTE_PATH) {
    return AUTH_REGISTER_ALIAS;
  }

  if (normalizedMethod === 'GET' && pathname === ME_ROUTE_PATH) {
    return AUTH_ME_ALIAS;
  }

  if (normalizedMethod === 'POST' && pathname === CHANGE_PASSWORD_ROUTE_PATH) {
    return AUTH_CHANGE_PASSWORD_ALIAS;
  }

  if (normalizedMethod === 'PATCH' && pathname === PROFILE_ROUTE_PATH) {
    return AUTH_PROFILE_UPDATE_ALIAS;
  }

  if (normalizedMethod === 'DELETE' && pathname.startsWith(ADMIN_USERS_ROUTE_PREFIX)) {
    return ADMIN_DELETE_USER_ALIAS;
  }

  if (normalizedMethod === 'POST' && pathname === '/api/posts') {
    return CONTENT_CREATE_POST_ALIAS;
  }

  if (normalizedMethod === 'POST' && /^\/api\/posts\/\d+\/comments\/?$/.test(pathname)) {
    return CONTENT_CREATE_COMMENT_ALIAS;
  }

  if (normalizedMethod === 'POST' && /^\/api\/posts\/\d+\/likes\/toggle\/?$/.test(pathname)) {
    return CONTENT_TOGGLE_POST_LIKE_ALIAS;
  }

  if (normalizedMethod === 'POST' && /^\/api\/comments\/\d+\/likes\/toggle\/?$/.test(pathname)) {
    return CONTENT_TOGGLE_COMMENT_LIKE_ALIAS;
  }

  return undefined;
};

/**
 * cy.request keeps its own cookie jar, so we extract the Sanctum cookies
 * explicitly and replay them in later API calls that must behave like the SPA.
 *
 * This keeps direct API setup helpers aligned with the same CSRF/session
 * contract enforced during browser-driven authentication.
 */
const getCsrfContext = (): Cypress.Chainable<CsrfContext> => {
  return cy
    .request({
      method: 'GET',
      url: `${resolveApiBackendUrl()}/sanctum/csrf-cookie`,
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      failOnStatusCode: false,
    })
    .then((response) => {
      expect(response.status, 'Sanctum CSRF status').to.be.oneOf(ACCEPTED_CSRF_STATUSES);

      const rawSetCookies = response.headers['set-cookie'];
      const setCookies = Array.isArray(rawSetCookies)
        ? rawSetCookies
        : rawSetCookies
          ? [rawSetCookies]
          : [];

      const cookieHeader = setCookies.map((cookie) => cookie.split(';')[0]).join('; ');

      const xsrfCookie = setCookies.find((cookie) => cookie.startsWith('XSRF-TOKEN='));

      if (!xsrfCookie || !cookieHeader) {
        throw new Error('Laravel no devolvio las cookies CSRF esperadas para Cypress.');
      }

      const token = xsrfCookie.slice('XSRF-TOKEN='.length).split(';')[0];

      return {
        cookieHeader,
        xsrfToken: decodeURIComponent(token),
      };
    });
};

const resolveUsername = (payload: RegisterPayload): string => {
  const username = payload.usuario ?? payload.username;

  if (!username) {
    throw new Error('Cypress register payload requires "usuario" or "username".');
  }

  return username;
};

/**
 * Rewrites browser-side same-origin API calls from the Angular frontend origin
 * to the backend listener used by cy.request.
 *
 * This proxy is test infrastructure only. It does not alter application code;
 * it simply lets Cypress observe and route the exact security-sensitive calls
 * emitted by the Angular browser flow.
 */
Cypress.Commands.add('routeLaravelBrowserTraffic', (): Cypress.Chainable<void> => {
  const browserBackendUrl = resolveBrowserBackendUrl();
  const apiBackendUrl = resolveApiBackendUrl();
  const browserBackendOrigin = new URL(browserBackendUrl).origin;
  const apiBackendOrigin = new URL(apiBackendUrl).origin;
  const apiBackendHost = new URL(apiBackendUrl).host;

  cy.intercept({ url: `${browserBackendOrigin}/**`, middleware: true }, (req) => {
    const originalUrl = new URL(req.url);
    const shouldForwardToLaravel =
      originalUrl.origin === browserBackendOrigin &&
      (originalUrl.pathname.startsWith('/api/') || originalUrl.pathname.startsWith('/sanctum/'));

    if (!shouldForwardToLaravel) {
      req.continue();
      return;
    }

    const rewrittenUrl = `${apiBackendOrigin}${originalUrl.pathname}${originalUrl.search}`;
    const alias = resolveBrowserAuthAlias(req.method, req.url);

    if (alias) {
      req.alias = alias;
    }

    req.url = rewrittenUrl;
    req.headers.host = apiBackendHost;

    req.on('before:response', (res) => {
      Cypress.log({
        name: 'laravel-proxy',
        message: `${req.method} ${originalUrl.href} -> ${rewrittenUrl} (${res.statusCode})${alias ? ` alias=@${alias}` : ''}`,
      });
    });

    req.continue();
  });

  return cy.wrap(null, { log: false }).then(() => undefined);
});

/**
 * Ejecuta requests stateful contra Laravel incluyendo cabecera CSRF valida.
 */
Cypress.Commands.add('csrfRequest', (options: CsrfRequestOptions): Cypress.Chainable<any> => {
  return getCsrfContext().then(({ cookieHeader, xsrfToken }) =>
    cy.request({
      failOnStatusCode: false,
      ...options,
      headers: {
        Accept: 'application/json',
        Cookie: cookieHeader,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-XSRF-TOKEN': xsrfToken,
        ...(options.headers ?? {}),
      },
    }),
  );
});

/**
 * Limpia sesion y almacenamiento local para que cada test arranque sin arrastre
 * de cookies previas ni user state del navegador.
 */
Cypress.Commands.add('resetAuthState', (): Cypress.Chainable<void> => {
  return cy
    .csrfRequest({
      method: 'POST',
      url: `${resolveApiBackendUrl()}/api/auth/logout`,
      failOnStatusCode: false,
    })
    .then((response) => {
      expect(response.status, 'logout cleanup status').to.be.oneOf(ACCEPTED_LOGOUT_STATUSES);
    })
    .then(() => {
      cy.clearAllCookies();
      cy.clearAllLocalStorage();
      cy.clearAllSessionStorage();
    })
    .then(() => undefined);
});

/**
 * Visita rutas protegidas para comprobar redirecciones.
 */
Cypress.Commands.add('visitProtectedRoute', (path: string): Cypress.Chainable<void> => {
  cy.visit(path);
  return cy.wrap(null).then(() => undefined);
});

/**
 * Registro usando UI (flujo e2e real). Cuando Angular debe bloquear el submit
 * en cliente, el spec puede pasar expectRequest=false para no esperar red.
 */
Cypress.Commands.add(
  'registerByUI',
  (payload: RegisterPayload, options?: UiSubmitOptions): Cypress.Chainable<void> => {
    const username = resolveUsername(payload);
    const expectRequest = options?.expectRequest ?? true;
    const browserBackendUrl = resolveBrowserBackendUrl();

    cy.task('log', `[${AUTH_CSRF_ALIAS} matcher] GET ${browserBackendUrl}${CSRF_ROUTE_PATH}`, {
      log: false,
    });
    cy.task(
      'log',
      `[${AUTH_REGISTER_ALIAS} matcher] POST ${browserBackendUrl}${REGISTER_ROUTE_PATH}`,
      { log: false },
    );
    logPathname('register:before-submit');
    cy.get('[data-cy=register-nombre]').clear().type(payload.nombre);
    cy.get('[data-cy=register-apellidos]').clear().type(payload.apellidos);
    cy.get('[data-cy=register-usuario]').clear().type(username);
    cy.get('[data-cy=register-email]').clear().type(payload.email);
    cy.get('[data-cy=register-password]').clear().type(payload.password);
    cy.get('[data-cy=register-password-confirm]').clear().type(payload.passwordConfirmation);
    cy.get('[data-cy=register-submit]').should('have.attr', 'type', 'submit').click();

    if (!expectRequest) {
      return logPathname('register:after-submit');
    }

    return cy
      .wait(`@${AUTH_CSRF_ALIAS}`, { timeout: UI_REQUEST_TIMEOUT })
      .then((interception) => logInterceptResult(AUTH_CSRF_ALIAS, interception))
      .then(() => cy.wait(`@${AUTH_REGISTER_ALIAS}`, { timeout: UI_REQUEST_TIMEOUT }))
      .then((interception) => logInterceptResult(AUTH_REGISTER_ALIAS, interception))
      .then(() => logPathname('register:after-submit'));
  },
);

/**
 * Registro por API para datos semilla de tests e2e.
 */
Cypress.Commands.add('registerByAPI', (payload: RegisterPayload): Cypress.Chainable<any> => {
  const username = resolveUsername(payload);

  return cy.csrfRequest({
    method: 'POST',
    url: `${resolveApiBackendUrl()}/api/auth/register`,
    withCredentials: true,
    body: {
      nombre: payload.nombre,
      apellidos: payload.apellidos,
      usuario: username,
      email: payload.email,
      password: payload.password,
      password_confirmation: payload.passwordConfirmation,
    },
  });
});

/**
 * Login por UI. Cuando Angular debe bloquear el submit en cliente, el spec
 * puede pasar expectRequest=false para no esperar una request inexistente.
 */
Cypress.Commands.add(
  'loginByUI',
  (payload: LoginPayload, options?: UiSubmitOptions): Cypress.Chainable<void> => {
    const expectRequest = options?.expectRequest ?? true;
    const browserBackendUrl = resolveBrowserBackendUrl();

    cy.task('log', `[${AUTH_CSRF_ALIAS} matcher] GET ${browserBackendUrl}${CSRF_ROUTE_PATH}`, {
      log: false,
    });
    cy.task('log', `[${AUTH_LOGIN_ALIAS} matcher] POST ${browserBackendUrl}${LOGIN_ROUTE_PATH}`, {
      log: false,
    });
    logPathname('login:before-submit');
    cy.get('[data-cy=login-identifier]').clear().type(payload.identifier);
    cy.get('[data-cy=login-password]').clear().type(payload.password);
    cy.get('[data-cy=login-submit]').should('have.attr', 'type', 'submit').click();

    if (!expectRequest) {
      return logPathname('login:after-submit');
    }

    return cy
      .wait(`@${AUTH_CSRF_ALIAS}`, { timeout: UI_REQUEST_TIMEOUT })
      .then((interception) => logInterceptResult(AUTH_CSRF_ALIAS, interception))
      .then(() => cy.wait(`@${AUTH_LOGIN_ALIAS}`, { timeout: UI_REQUEST_TIMEOUT }))
      .then((interception) => logInterceptResult(AUTH_LOGIN_ALIAS, interception))
      .then(() => logPathname('login:after-submit'));
  },
);

/**
 * Login por API para preparar estado de sesion cuando convenga.
 */
Cypress.Commands.add('loginByAPI', (payload: LoginPayload): Cypress.Chainable<any> => {
  return cy
    .csrfRequest({
      method: 'POST',
      url: `${resolveApiBackendUrl()}/api/auth/login`,
      withCredentials: true,
      body: {
        identifier: payload.identifier,
        password: payload.password,
      },
    })
    .then((response) => {
      expect(response.status).to.eq(200);
      return response;
    });
});

/**
 * Asercion util para mensajes de error de login.
 */
Cypress.Commands.add(
  'assertLoginErrorMessage',
  (message: string): Cypress.Chainable<JQuery<HTMLElement>> => {
    return cy
      .get('[data-cy=login-error-message]', { timeout: 10000 })
      .should('be.visible')
      .and('contain.text', message);
  },
);

/**
 * Cierra sesion contra API real para validar invalidacion.
 */
Cypress.Commands.add('apiLogout', (): Cypress.Chainable<void> => {
  return cy
    .csrfRequest({
      method: 'POST',
      url: `${resolveApiBackendUrl()}/api/auth/logout`,
      failOnStatusCode: false,
    })
    .then((response) => {
      expect(response.status, 'api logout status').to.be.oneOf(ACCEPTED_LOGOUT_STATUSES);
    })
    .then(() => undefined);
});

/**
 * Abre la pestaña "Cuenta" en perfil y espera el formulario de contraseña.
 */
Cypress.Commands.add('openProfileAccountTab', (): Cypress.Chainable<void> => {
  cy.contains('button.tab', 'Cuenta', { timeout: 15000 }).click();
  cy.get('[data-cy=change-password-form]').should('be.visible');
  return cy.wrap(null, { log: false }).then(() => undefined);
});

/**
 * Completa y envía el formulario de creación de post desde la UI.
 */
Cypress.Commands.add('createPostByUI', (payload: CreatePostUiPayload): Cypress.Chainable<void> => {
  cy.get('section.create-post-page').should('be.visible');
  cy.get('#post-title').clear().type(payload.title).should('have.value', payload.title);
  cy.get('#post-content').clear().type(payload.content).should('have.value', payload.content);

  if (payload.tagName !== undefined) {
    cy.get('section.create-post-page')
      .contains('label.tag-option', payload.tagName)
      .find('input[type="checkbox"]')
      .check({ force: true });
  }

  cy.get('section.create-post-page')
    .contains('button[type="submit"]', 'Publicar')
    .should('be.visible')
    .and('not.be.disabled')
    .click();

  return cy.wrap(null, { log: false }).then(() => undefined);
});

/**
 * Espera el bootstrap común de specs de posts mockeados.
 */
Cypress.Commands.add(
  'waitForPostsBootstrap',
  (options?: PostsBootstrapWaitOptions): Cypress.Chainable<void> => {
    const shouldWaitPosts = options?.waitPosts ?? false;
    const postsAlias = options?.postsAlias ?? '@getPosts';

    // Home debe quedar hidratado antes de interactuar con el feed o el aside.
    cy.wait('@authMe');
    cy.wait('@tagCategories');
    cy.wait('@users');
    cy.wait('@homeSidebar');
    if (shouldWaitPosts) {
      cy.wait(postsAlias);
    }

    return cy.wrap(null, { log: false }).then(() => undefined);
  },
);

export {};

import { buildE2ECredentials } from '../../builders/UserBuilder';

type Credentials = ReturnType<typeof buildE2ECredentials>;

type CreatedPost = {
  id: number;
};

describe('E2E - Comments (real flow)', () => {
  let uniqueUserSeed = 0;

  const resolveBrowserBackendUrl = () => {
    const configuredBrowserBackendUrl = Cypress.env('browserBackendUrl');
    if (typeof configuredBrowserBackendUrl === 'string' && configuredBrowserBackendUrl.length > 0) {
      return configuredBrowserBackendUrl;
    }

    return Cypress.config('baseUrl') ?? 'http://127.0.0.1:4200';
  };

  const buildUniqueUser = (prefix: string): Credentials => {
    const user = buildE2ECredentials(prefix);
    const normalizedPrefix = prefix
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 8)
      .toLowerCase();
    const token = `${Date.now().toString().slice(-6)}${(uniqueUserSeed++).toString().padStart(2, '0')}`;
    const username = `${normalizedPrefix}_${token}`;

    user.usuario = username;
    user.username = username;
    user.email = `test_${normalizedPrefix}_${token}@test.com`;

    return user;
  };

  const registerTestUser = (user: Credentials) => {
    return cy
      .registerByAPI({
        ...user,
        passwordConfirmation: user.passwordConfirmation,
      })
      .its('status')
      .should('eq', 201);
  };

  const loginAsUser = (user: { usuario: string; password: string }) => {
    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });
    cy.url({ timeout: 15000 }).should('include', '/home');
  };

  const createPostFromBrowserSession = (): Cypress.Chainable<CreatedPost> => {
    const title = `Post comentarios Cypress ${Date.now()}`;
    const content = `Contenido estable para pruebas de comentarios Cypress ${Date.now()}.`;

    return cy.window().then((win) => {
      const xsrfCookie = win.document.cookie
        .split('; ')
        .find((cookie) => cookie.startsWith('XSRF-TOKEN='));

      if (!xsrfCookie) {
        throw new Error('Missing XSRF-TOKEN cookie before creating comment test post.');
      }

      const xsrfToken = decodeURIComponent(xsrfCookie.slice('XSRF-TOKEN='.length));

      return win
        .fetch(`${resolveBrowserBackendUrl()}/api/posts`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': xsrfToken,
          },
          body: JSON.stringify({
            title,
            content,
            tag_ids: [],
          }),
        })
        .then(async (response) => {
          const body = await response.json();
          expect(response.status, 'create post status').to.eq(201);
          expect(body?.data?.id, 'created post id').to.be.a('number').and.be.greaterThan(0);

          return {
            id: body.data.id as number,
          };
        });
    });
  };

  const goToPostDetail = (postId: number) => {
    cy.visit(`/home/post/${postId}`);
    cy.url({ timeout: 15000 }).should('include', `/home/post/${postId}`);
    cy.get('[data-cy=post-detail-card]', { timeout: 15000 }).should('be.visible');
    cy.get('[data-cy=comments-toggle]', { timeout: 15000 }).should('be.visible');
    openCommentsPanel();
  };

  const openCommentsPanel = () => {
    cy.get('body').then(($body) => {
      if ($body.find('[data-cy=comments-panel]:visible').length === 0) {
        cy.get('[data-cy=comments-toggle]', { timeout: 15000 }).should('be.visible').click();
      }
    });

    cy.get('[data-cy=comments-panel]', { timeout: 15000 }).should('be.visible');
    cy.get('[data-cy=comments-panel] .comments-loading', { timeout: 15000 }).should('not.exist');
    cy.get('[data-cy=comment-input]', { timeout: 15000 }).should('be.visible');
  };

  const submitComment = (text: string) => {
    cy.get('[data-cy=comment-input]', { timeout: 15000 })
      .should('be.visible')
      .clear()
      .type(text)
      .should('have.value', text);
    cy.get('[data-cy=comment-submit]')
      .should('be.visible')
      .and('not.be.disabled')
      .click();
    cy.wait('@contentCreateComment', { timeout: 15000 }).then((interception) => {
      const pathname = new URL(interception.request.url).pathname.replace(/\/$/, '');
      cy.task('log', `[contentCreateComment] ${interception.request.method} ${interception.request.url} -> ${interception.response?.statusCode ?? 'NO_RESPONSE'}`, { log: false });
      expect(pathname, 'comment create endpoint').to.match(/^\/api\/posts\/\d+\/comments$/);
      expect(interception.response?.statusCode, 'comment create status').to.eq(201);
    });
  };

  beforeEach(() => {
    cy.routeLaravelBrowserTraffic();
    cy.resetAuthState();
    cy.visit('/login');
  });

  it('renders comments block and comment form on a created post detail', () => {
    const user = buildUniqueUser('comments_render');

    registerTestUser(user);
    loginAsUser(user);
    createPostFromBrowserSession().then(({ id }) => {
      goToPostDetail(id);

      cy.get('[data-cy=comments-list], [data-cy=comments-empty]').should('be.visible');
      cy.get('[data-cy=comment-input]').should('be.visible');
    });
  });

  it('creates a real comment in post detail', () => {
    const user = buildUniqueUser('comments_create');
    const commentText = `Comentario real Cypress ${Date.now()}`;

    registerTestUser(user);
    loginAsUser(user);
    createPostFromBrowserSession().then(({ id }) => {
      goToPostDetail(id);

      submitComment(commentText);
      cy.contains('[data-cy=comments-list] .comment-item-text', commentText, {
        timeout: 15000,
      }).should('be.visible');
    });
  });

  it('keeps a created comment visible after reload', () => {
    const user = buildUniqueUser('comments_reload');
    const commentText = `Comentario persistente Cypress ${Date.now()}`;

    registerTestUser(user);
    loginAsUser(user);
    createPostFromBrowserSession().then(({ id }) => {
      goToPostDetail(id);

      submitComment(commentText);
      cy.contains('[data-cy=comments-list] .comment-item-text', commentText, {
        timeout: 15000,
      }).should('be.visible');

      cy.reload();
      cy.url({ timeout: 15000 }).should('include', `/home/post/${id}`);
      cy.get('[data-cy=post-detail-card]', { timeout: 15000 }).should('be.visible');
      openCommentsPanel();
      cy.contains('[data-cy=comments-list] .comment-item-text', commentText, {
        timeout: 15000,
      }).should('be.visible');
    });
  });
});

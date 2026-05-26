import { buildE2ECredentials } from '../../builders/UserBuilder';

type Credentials = ReturnType<typeof buildE2ECredentials>;

describe('E2E - Security edge cases (real flow)', () => {
  let uniqueUserSeed = 0;

  const buildUniqueUser = (prefix: string): Credentials => {
    const user = buildE2ECredentials(prefix);
    const normalizedPrefix = prefix.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
    const token = `${Date.now().toString().slice(-6)}${(uniqueUserSeed++).toString().padStart(2, '0')}`;
    const username = `${normalizedPrefix}_${token}`;

    user.usuario = username;
    user.username = username;
    user.email = `test_${normalizedPrefix}_${token}@test.com`;

    return user;
  };

  const registerTestUser = (user: Credentials) => {
    return cy.registerByAPI({
      ...user,
      passwordConfirmation: user.passwordConfirmation,
    }).its('status').should('eq', 201);
  };

  const loginAsUser = (user: { usuario: string; password: string }) => {
    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });
    cy.url({ timeout: 15000 }).should('include', '/home');
    cy.get('[data-cy=home-root]').should('be.visible');
  };

  const createPostAsCurrentUser = (title: string, content: string): Cypress.Chainable<number> => {
    cy.visit('/home/create-post');
    cy.get('section.create-post-page', { timeout: 15000 }).should('be.visible');
    cy.createPostByUI({
      title,
      content,
      tagName: 'Angular',
    });

    return cy.wait('@contentCreatePost', { timeout: 15000 }).then((interception) => {
      const pathname = new URL(interception.request.url).pathname.replace(/\/$/, '');
      expect(pathname, 'post create endpoint').to.eq('/api/posts');
      expect(interception.response?.statusCode, 'create post status').to.eq(201);
      const postId = interception.response?.body?.data?.id;
      expect(postId, 'created post id').to.be.a('number').and.be.greaterThan(0);

      return cy
        .task('log', `[contentCreatePost] ${interception.request.method} ${interception.request.url} -> ${interception.response?.statusCode ?? 'NO_RESPONSE'}`, { log: false })
        .then(() => cy.wrap(postId as number, { log: false }));
    });
  };

  const openPostDetail = (postId: number, title: string) => {
    cy.visit(`/home/post/${postId}`);
    cy.url({ timeout: 15000 }).should('include', `/home/post/${postId}`);
    cy.get('[data-cy=post-detail-card]', { timeout: 15000 }).should('be.visible');
    cy.get('[data-cy=post-title]').should('contain.text', title);
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

  beforeEach(() => {
    cy.routeLaravelBrowserTraffic();
    cy.resetAuthState();
    cy.visit('/login');
  });

  it('does not allow creating post without login', () => {
    cy.visit('/home/create-post');
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.get('[data-cy=login-form]').should('be.visible');
  });

  it('does not allow commenting without login', () => {
    cy.visit('/home/post/1');
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.get('[data-cy=login-form]').should('be.visible');
  });

  it('does not show edit post action for a different user', () => {
    const authorUser = buildUniqueUser('sec_author');
    const otherUser = buildUniqueUser('sec_other');
    const postTitle = `Post no editable por otro ${Date.now()}`;
    const postContent = `Contenido de seguridad ${Date.now()} con longitud suficiente para validar permisos.`;

    registerTestUser(authorUser);
    registerTestUser(otherUser);

    loginAsUser(authorUser);
    createPostAsCurrentUser(postTitle, postContent).then((postId) => {
      cy.resetAuthState();
      loginAsUser(otherUser);

      openPostDetail(postId, postTitle);
      cy.get('button.edit-btn').should('not.exist');
    });
  });

  it('does not show delete comment action for a different user', () => {
    const authorUser = buildUniqueUser('sec_cauthor');
    const otherUser = buildUniqueUser('sec_cother');
    const postTitle = `Post comentario protegido ${Date.now()}`;
    const postContent = `Contenido para validar borrado de comentario ${Date.now()} suficientemente largo.`;
    const commentText = `Comentario protegido ${Date.now()}`;

    registerTestUser(authorUser);
    registerTestUser(otherUser);

    loginAsUser(authorUser);
    createPostAsCurrentUser(postTitle, postContent).then((postId) => {
      openPostDetail(postId, postTitle);

      openCommentsPanel();
      cy.get('[data-cy=comment-input]')
        .should('be.visible')
        .clear()
        .type(commentText)
        .should('have.value', commentText);
      cy.get('[data-cy=comment-submit]').should('be.visible').and('not.be.disabled').click();
      cy.wait('@contentCreateComment', { timeout: 15000 }).then((interception) => {
        const pathname = new URL(interception.request.url).pathname.replace(/\/$/, '');
        cy.task('log', `[contentCreateComment] ${interception.request.method} ${interception.request.url} -> ${interception.response?.statusCode ?? 'NO_RESPONSE'}`, { log: false });
        expect(pathname, 'comment create endpoint').to.match(/^\/api\/posts\/\d+\/comments$/);
        expect(interception.response?.statusCode, 'comment create status').to.eq(201);
      });
      cy.contains('[data-cy=comments-list] .comment-item-text', commentText, { timeout: 15000 }).should('be.visible');

      cy.resetAuthState();
      loginAsUser(otherUser);
      openPostDetail(postId, postTitle);
      openCommentsPanel();

      cy.contains('li.comment-item', commentText).within(() => {
        cy.get('button.delete-comment-btn').should('not.exist');
      });
    });
  });
});

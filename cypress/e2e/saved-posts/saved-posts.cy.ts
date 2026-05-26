import { buildE2ECredentials } from '../../builders/UserBuilder';

type Credentials = ReturnType<typeof buildE2ECredentials>;

describe('E2E - Saved posts (real flow)', () => {
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

  const createPostByUi = (title: string, content: string): Cypress.Chainable<number> => {
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

  const savePostFromDetail = () => {
    cy.get('[data-cy=post-detail-card]', { timeout: 15000 })
      .should('be.visible')
      .trigger('mouseenter');
    cy.get('[data-cy=post-detail-card] button.bookmark-btn', { timeout: 15000 })
      .first()
      .should('exist')
      .click({ force: true });
    cy.get('[data-cy=post-detail-card] button.bookmark-btn', { timeout: 15000 })
      .first()
      .should('have.class', 'is-saved');
  };

  const openSavedTabInProfile = () => {
    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
    cy.contains('button.tab', 'Guardados', { timeout: 15000 }).click();
  };

  beforeEach(() => {
    cy.routeLaravelBrowserTraffic();
    cy.resetAuthState();
    cy.visit('/login');
  });

  it('saves a post from post detail', () => {
    const user = buildUniqueUser('saved_create');
    const postTitle = `Post guardado ${Date.now()}`;
    const postContent = `Contenido para guardado ${Date.now()} con longitud suficiente.`;

    registerTestUser(user);
    loginAsUser(user);
    createPostByUi(postTitle, postContent).then((postId) => {
      openPostDetail(postId, postTitle);
      savePostFromDetail();
    });
  });

  it('shows saved posts in profile tab', () => {
    const user = buildUniqueUser('saved_list');
    const postTitle = `Post visible guardados ${Date.now()}`;
    const postContent = `Contenido para lista de guardados ${Date.now()} con longitud suficiente.`;

    registerTestUser(user);
    loginAsUser(user);
    createPostByUi(postTitle, postContent).then((postId) => {
      openPostDetail(postId, postTitle);
      savePostFromDetail();
      openSavedTabInProfile();
    });

    cy.contains('.posts-grid .post-card-link', postTitle, { timeout: 15000 }).should('be.visible');
  });

  it('removes a saved post from profile saved tab', () => {
    const user = buildUniqueUser('saved_remove');
    const postTitle = `Post para quitar guardado ${Date.now()}`;
    const postContent = `Contenido para quitar guardado ${Date.now()} con longitud suficiente.`;

    registerTestUser(user);
    loginAsUser(user);
    createPostByUi(postTitle, postContent).then((postId) => {
      openPostDetail(postId, postTitle);
      savePostFromDetail();
      openSavedTabInProfile();
    });

    cy.contains('.posts-grid .post-card', postTitle).as('savedPostCard');
    cy.get('@savedPostCard').find('button.post-card-link').focus();
    cy.get('@savedPostCard').find('button.bookmark-btn').first().should('have.class', 'is-saved');
    cy.contains('.posts-grid .post-card', postTitle)
      .find('button.bookmark-btn.is-saved')
      .first()
      .focus()
      .should('be.focused')
      .type('{enter}');

    cy.contains('.posts-grid .post-card-link', postTitle).should('not.exist');
    cy.get('.posts-empty').should('be.visible');
  });
});

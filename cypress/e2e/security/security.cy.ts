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

  const createPostAsCurrentUser = (title: string, content: string) => {
    cy.visit('/home/create-post');
    cy.get('[data-cy=home-root]').should('be.visible');
    cy.createPostByUI({
      title,
      content,
      tagName: 'Angular',
    });
    cy.url({ timeout: 15000 }).should('include', '/home');
    cy.contains('article.post-item h3', title, { timeout: 15000 }).should('be.visible');
  };

  const openPostDetailFromFeed = (title: string) => {
    cy.contains('article.post-item h3', title, { timeout: 15000 }).should('be.visible').click();
    cy.url({ timeout: 15000 }).should('include', '/home/post/');
    cy.get('.post-detail-page').should('be.visible');
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
    createPostAsCurrentUser(postTitle, postContent);

    cy.resetAuthState();
    loginAsUser(otherUser);

    openPostDetailFromFeed(postTitle);
    cy.get('button.edit-btn').should('not.exist');
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
    createPostAsCurrentUser(postTitle, postContent);
    openPostDetailFromFeed(postTitle);

    cy.get('button.comments-toggle', { timeout: 15000 }).should('be.visible').click();
    cy.get('.comments-panel', { timeout: 15000 }).should('be.visible');
    cy.get('.comments-form-section textarea').should('be.visible').clear().type(commentText);
    cy.contains('.comment-form-actions button', 'Enviar').click();
    cy.contains('li.comment-item .comment-item-text', commentText, { timeout: 15000 }).should('be.visible');

    cy.resetAuthState();
    loginAsUser(otherUser);
    openPostDetailFromFeed(postTitle);
    cy.get('button.comments-toggle', { timeout: 15000 }).should('be.visible').click();
    cy.get('.comments-panel', { timeout: 15000 }).should('be.visible');

    cy.contains('li.comment-item', commentText).within(() => {
      cy.get('button.delete-comment-btn').should('not.exist');
    });
  });
});

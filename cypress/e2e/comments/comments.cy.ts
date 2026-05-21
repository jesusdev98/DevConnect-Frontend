import { buildE2ECredentials } from '../../builders/UserBuilder';

type Credentials = ReturnType<typeof buildE2ECredentials>;

describe('E2E - Comments (real flow)', () => {
  // Dependency note: this spec targets a real post id expected in local env.
  const REAL_POST_ID = 12;
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
  };

  const goToRealPostDetail = () => {
    cy.visit(`/home/post/${REAL_POST_ID}`);
    cy.url({ timeout: 15000 }).should('include', `/home/post/${REAL_POST_ID}`);
    cy.get('.post-detail-page').should('be.visible');
    cy.get('button.comments-toggle', { timeout: 15000 }).should('be.visible').click();
    cy.get('.comments-panel', { timeout: 15000 }).should('be.visible');
  };

  const submitComment = (text: string) => {
    cy.get('.comments-form-section textarea', { timeout: 15000 }).should('be.visible').clear().type(text);
    cy.contains('.comment-form-actions button', 'Enviar').click();
  };

  beforeEach(() => {
    cy.routeLaravelBrowserTraffic();
    cy.resetAuthState();
    cy.visit('/login');
  });

  it('renders comments block and comment form on real post detail', () => {
    const user = buildUniqueUser('comments_render');

    registerTestUser(user);
    loginAsUser(user);
    goToRealPostDetail();

    cy.get('ul.comments-list, p.comments-empty').should('be.visible');
    cy.get('.comments-form-section textarea').should('be.visible');
  });

  it('creates a real comment in post detail', () => {
    const user = buildUniqueUser('comments_create');
    const commentText = `Comentario real Cypress ${Date.now()}`;

    registerTestUser(user);
    loginAsUser(user);
    goToRealPostDetail();

    submitComment(commentText);
    cy.contains('.comments-list .comment-item-text', commentText, { timeout: 15000 }).should('be.visible');
  });

  it('keeps a created comment visible after reload', () => {
    const user = buildUniqueUser('comments_reload');
    const commentText = `Comentario persistente Cypress ${Date.now()}`;

    registerTestUser(user);
    loginAsUser(user);
    goToRealPostDetail();

    submitComment(commentText);
    cy.contains('.comments-list .comment-item-text', commentText, { timeout: 15000 }).should('be.visible');

    cy.reload();
    cy.url({ timeout: 15000 }).should('include', `/home/post/${REAL_POST_ID}`);
    cy.get('button.comments-toggle', { timeout: 15000 }).should('be.visible').click();
    cy.get('.comments-panel', { timeout: 15000 }).should('be.visible');
    cy.contains('.comments-list .comment-item-text', commentText, { timeout: 15000 }).should('be.visible');
  });
});

import { buildE2ECredentials } from '../../builders/UserBuilder';

type Credentials = ReturnType<typeof buildE2ECredentials>;

describe('E2E - Likes (real flow)', () => {
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

  const createPostAndOpenDetail = (title: string, content: string) => {
    cy.visit('/home/create-post');
    cy.get('[data-cy=home-root]').should('be.visible');
    cy.createPostByUI({
      title,
      content,
      tagName: 'Angular',
    });

    cy.url({ timeout: 15000 }).should('include', '/home');
    cy.contains('article.post-item h3', title, { timeout: 15000 }).should('be.visible').click();
    cy.url({ timeout: 15000 }).should('include', '/home/post/');
    cy.get('.post-detail-page').should('be.visible');
  };

  const openCommentsPanel = () => {
    cy.get('button.comments-toggle', { timeout: 15000 }).should('be.visible').click();
    cy.get('.comments-panel', { timeout: 15000 }).should('be.visible');
  };

  const getPostLikeCount = () => {
    return cy.get('.post-footer .like-btn .like-count').invoke('text').then((text) => Number.parseInt(text.trim(), 10));
  };

  beforeEach(() => {
    cy.routeLaravelBrowserTraffic();
    cy.resetAuthState();
    cy.visit('/login');
  });

  it('likes a post from post detail', () => {
    const user = buildUniqueUser('likes_post');
    const postTitle = `Like post ${Date.now()}`;
    const postContent = `Contenido para like de post ${Date.now()} con longitud suficiente.`;

    registerTestUser(user);
    loginAsUser(user);
    createPostAndOpenDetail(postTitle, postContent);

    cy.get('.post-footer .like-btn').should('be.visible').and('not.have.class', 'liked').click();
    cy.get('.post-footer .like-btn').should('have.class', 'liked');
  });

  it('unlikes a post after liking it', () => {
    const user = buildUniqueUser('unlike_post');
    const postTitle = `Unlike post ${Date.now()}`;
    const postContent = `Contenido para unlike de post ${Date.now()} con longitud suficiente.`;

    registerTestUser(user);
    loginAsUser(user);
    createPostAndOpenDetail(postTitle, postContent);

    cy.get('.post-footer .like-btn').click();
    cy.get('.post-footer .like-btn').should('have.class', 'liked');
    cy.get('.post-footer .like-btn').click();
    cy.get('.post-footer .like-btn').should('not.have.class', 'liked');
  });

  it('likes a comment in post detail', () => {
    const user = buildUniqueUser('like_comment');
    const postTitle = `Like comment ${Date.now()}`;
    const postContent = `Contenido para like de comentario ${Date.now()} con longitud suficiente.`;
    const commentText = `Comentario para like ${Date.now()}`;

    registerTestUser(user);
    loginAsUser(user);
    createPostAndOpenDetail(postTitle, postContent);
    openCommentsPanel();

    cy.get('.comments-form-section textarea').should('be.visible').clear().type(commentText);
    cy.contains('.comment-form-actions button', 'Enviar').click();
    cy.contains('.comments-list .comment-item-text', commentText, { timeout: 15000 }).should('be.visible');

    cy.contains('li.comment-item', commentText).within(() => {
      cy.get('button.like-btn.like-btn--sm').first().should('be.visible').and('not.have.class', 'liked').click();
      cy.get('button.like-btn.like-btn--sm').first().should('have.class', 'liked');
    });
  });

  it('updates post like counter when liking and unliking', () => {
    const user = buildUniqueUser('likes_counter');
    const postTitle = `Like counter ${Date.now()}`;
    const postContent = `Contenido para contador de likes ${Date.now()} con longitud suficiente.`;

    registerTestUser(user);
    loginAsUser(user);
    createPostAndOpenDetail(postTitle, postContent);

    getPostLikeCount().then((initialCount) => {
      cy.get('.post-footer .like-btn').click();
      cy.get('.post-footer .like-btn').should('have.class', 'liked');
      cy.get('.post-footer .like-btn .like-count').invoke('text').then((text) => {
        expect(text.trim()).to.eq(`${initialCount + 1}`);
      });

      cy.get('.post-footer .like-btn').click();
      cy.get('.post-footer .like-btn').should('not.have.class', 'liked');
      cy.get('.post-footer .like-btn .like-count').invoke('text').then((text) => {
        expect(text.trim()).to.eq(`${initialCount}`);
      });
    });
  });
});

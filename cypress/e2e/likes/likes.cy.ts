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
    cy.intercept('POST', '**/api/posts').as('createPost');
    cy.createPostByUI({
      title,
      content,
      tagName: 'Angular',
    });

    cy.wait('@createPost', { timeout: 15000 }).then((interception) => {
      expect(interception.response?.statusCode, 'create post status').to.eq(201);
      const postId = interception.response?.body?.data?.id;
      expect(postId, 'created post id').to.be.a('number').and.be.greaterThan(0);

      cy.visit(`/home/post/${postId}`);
      cy.url({ timeout: 15000 }).should('include', `/home/post/${postId}`);
      cy.get('[data-cy=post-detail-card]', { timeout: 15000 }).should('be.visible');
      cy.get('[data-cy=post-title]').should('contain.text', title);
      cy.get('[data-cy=comments-toggle]').should('be.visible');
    });
  };

  const openCommentsPanel = () => {
    cy.intercept('GET', '**/api/posts/*/comments').as('getComments');
    cy.get('[data-cy=comments-toggle]', { timeout: 15000 }).should('be.visible').click();
    cy.wait('@getComments', { timeout: 15000 })
      .its('response.statusCode')
      .should('eq', 200);
    cy.get('[data-cy=comments-panel]', { timeout: 15000 }).should('be.visible');
  };

  const getPostLikeCount = () => {
    return cy.get('[data-cy=post-like-button] .like-count').invoke('text').then((text) => Number.parseInt(text.trim(), 10));
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

    cy.intercept('POST', '**/api/posts/*/likes/toggle').as('togglePostLike');
    cy.get('[data-cy=post-like-button]').should('be.visible').and('not.have.class', 'liked').click();
    cy.wait('@togglePostLike', { timeout: 15000 }).its('response.statusCode').should('eq', 200);
    cy.get('[data-cy=post-like-button]').should('have.class', 'liked');
  });

  it('unlikes a post after liking it', () => {
    const user = buildUniqueUser('unlike_post');
    const postTitle = `Unlike post ${Date.now()}`;
    const postContent = `Contenido para unlike de post ${Date.now()} con longitud suficiente.`;

    registerTestUser(user);
    loginAsUser(user);
    createPostAndOpenDetail(postTitle, postContent);

    cy.intercept('POST', '**/api/posts/*/likes/toggle').as('togglePostLike');
    cy.get('[data-cy=post-like-button]').click();
    cy.wait('@togglePostLike', { timeout: 15000 }).its('response.statusCode').should('eq', 200);
    cy.get('[data-cy=post-like-button]').should('have.class', 'liked');
    cy.get('[data-cy=post-like-button]').click();
    cy.wait('@togglePostLike', { timeout: 15000 }).its('response.statusCode').should('eq', 200);
    cy.get('[data-cy=post-like-button]').should('not.have.class', 'liked');
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

    cy.intercept('POST', '**/api/posts/*/comments').as('createComment');
    cy.get('[data-cy=comment-input]').should('be.visible').clear().type(commentText);
    cy.get('[data-cy=comment-submit]').click();
    cy.wait('@createComment', { timeout: 15000 }).its('response.statusCode').should('eq', 201);
    cy.contains('[data-cy=comments-list] .comment-item-text', commentText, { timeout: 15000 }).should('be.visible');

    cy.contains('li.comment-item', commentText).within(() => {
      cy.intercept('POST', '**/api/comments/*/likes/toggle').as('toggleCommentLike');
      cy.get('[data-cy=comment-like-button]').first().should('be.visible').and('not.have.class', 'liked').click();
      cy.wait('@toggleCommentLike', { timeout: 15000 }).its('response.statusCode').should('eq', 200);
      cy.get('[data-cy=comment-like-button]').first().should('have.class', 'liked');
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
      cy.intercept('POST', '**/api/posts/*/likes/toggle').as('togglePostLike');
      cy.get('[data-cy=post-like-button]').click();
      cy.wait('@togglePostLike', { timeout: 15000 }).its('response.statusCode').should('eq', 200);
      cy.get('[data-cy=post-like-button]').should('have.class', 'liked');
      cy.get('[data-cy=post-like-button] .like-count').invoke('text').then((text) => {
        expect(text.trim()).to.eq(`${initialCount + 1}`);
      });

      cy.get('[data-cy=post-like-button]').click();
      cy.wait('@togglePostLike', { timeout: 15000 }).its('response.statusCode').should('eq', 200);
      cy.get('[data-cy=post-like-button]').should('not.have.class', 'liked');
      cy.get('[data-cy=post-like-button] .like-count').invoke('text').then((text) => {
        expect(text.trim()).to.eq(`${initialCount}`);
      });
    });
  });
});

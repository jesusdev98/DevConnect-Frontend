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
    cy.get('section.create-post-page', { timeout: 15000 }).should('be.visible');
    cy.createPostByUI({
      title,
      content,
      tagName: 'Angular',
    });

    cy.wait('@contentCreatePost', { timeout: 15000 }).then((interception) => {
      const pathname = new URL(interception.request.url).pathname.replace(/\/$/, '');
      cy.task('log', `[contentCreatePost] ${interception.request.method} ${interception.request.url} -> ${interception.response?.statusCode ?? 'NO_RESPONSE'}`, { log: false });
      expect(pathname, 'post create endpoint').to.eq('/api/posts');
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
    cy.get('body').then(($body) => {
      if ($body.find('[data-cy=comments-panel]:visible').length === 0) {
        cy.get('[data-cy=comments-toggle]', { timeout: 15000 }).should('be.visible').click();
      }
    });

    cy.get('[data-cy=comments-panel]', { timeout: 15000 }).should('be.visible');
    cy.get('[data-cy=comments-panel] .comments-loading', { timeout: 15000 }).should('not.exist');
    cy.get('[data-cy=comment-input]', { timeout: 15000 }).should('be.visible');
  };

  const getPostLikeCount = () => {
    return cy.get('[data-cy=post-like-button] .like-count').invoke('text').then((text) => Number.parseInt(text.trim(), 10));
  };

  const waitForPostLikeToggle = () => {
    cy.wait('@contentTogglePostLike', { timeout: 15000 }).then((interception) => {
      const pathname = new URL(interception.request.url).pathname.replace(/\/$/, '');
      cy.task('log', `[contentTogglePostLike] ${interception.request.method} ${interception.request.url} -> ${interception.response?.statusCode ?? 'NO_RESPONSE'}`, { log: false });
      expect(pathname, 'post like endpoint').to.match(/^\/api\/posts\/\d+\/likes\/toggle$/);
      expect(interception.response?.statusCode, 'post like status').to.eq(200);
    });
  };

  const waitForCommentLikeToggle = () => {
    cy.wait('@contentToggleCommentLike', { timeout: 15000 }).then((interception) => {
      const pathname = new URL(interception.request.url).pathname.replace(/\/$/, '');
      cy.task('log', `[contentToggleCommentLike] ${interception.request.method} ${interception.request.url} -> ${interception.response?.statusCode ?? 'NO_RESPONSE'}`, { log: false });
      expect(pathname, 'comment like endpoint').to.match(/^\/api\/comments\/\d+\/likes\/toggle$/);
      expect(interception.response?.statusCode, 'comment like status').to.eq(200);
    });
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

    cy.get('[data-cy=post-like-button]').should('be.visible').and('not.have.class', 'liked').click();
    waitForPostLikeToggle();
    cy.get('[data-cy=post-like-button]').should('have.class', 'liked');
  });

  it('unlikes a post after liking it', () => {
    const user = buildUniqueUser('unlike_post');
    const postTitle = `Unlike post ${Date.now()}`;
    const postContent = `Contenido para unlike de post ${Date.now()} con longitud suficiente.`;

    registerTestUser(user);
    loginAsUser(user);
    createPostAndOpenDetail(postTitle, postContent);

    cy.get('[data-cy=post-like-button]').should('be.visible').click();
    waitForPostLikeToggle();
    cy.get('[data-cy=post-like-button]').should('have.class', 'liked');
    cy.get('[data-cy=post-like-button]').should('be.visible').click();
    waitForPostLikeToggle();
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

    cy.contains('li.comment-item', commentText).within(() => {
      cy.get('[data-cy=comment-like-button]').first().should('be.visible').and('not.have.class', 'liked').click();
      waitForCommentLikeToggle();
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
      cy.get('[data-cy=post-like-button]').should('be.visible').click();
      waitForPostLikeToggle();
      cy.get('[data-cy=post-like-button]').should('have.class', 'liked');
      cy.get('[data-cy=post-like-button] .like-count').invoke('text').then((text) => {
        expect(text.trim()).to.eq(`${initialCount + 1}`);
      });

      cy.get('[data-cy=post-like-button]').should('be.visible').click();
      waitForPostLikeToggle();
      cy.get('[data-cy=post-like-button]').should('not.have.class', 'liked');
      cy.get('[data-cy=post-like-button] .like-count').invoke('text').then((text) => {
        expect(text.trim()).to.eq(`${initialCount}`);
      });
    });
  });
});

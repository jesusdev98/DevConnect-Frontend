import { buildMockPost } from '../../builders/PostBuilder';
import { mockHomeBootstrapApi } from '../../support/intercepts/homeApi';

/**
 * E2E posts coverage without touching a real database.
 *
 * Strategy:
 * - mock auth/session and API responses with cy.intercept.
 * - verify payload/query emitted by the SPA.
 * - keep tests deterministic and backend-independent.
 */
describe('E2E - Posts (mocked API)', () => {
  let emptyPostsBody: {
    success: boolean;
    message: string;
    data: unknown[];
  };
  let titleExistsValidationBody: {
    success: boolean;
    message: string;
    errors: Record<string, string[]>;
  };

  const interceptEmptyPostsFeed = (alias = 'getPosts') => {
    cy.intercept('GET', '**/api/posts*', {
      statusCode: 200,
      body: emptyPostsBody,
    }).as(alias);
  };

  before(() => {
    cy.fixture('posts/empty-success.json').then((postsBody) => {
      emptyPostsBody = postsBody as {
        success: boolean;
        message: string;
        data: unknown[];
      };
    });

    cy.fixture('posts/title-exists-422.json').then((validationBody) => {
      titleExistsValidationBody = validationBody as {
        success: boolean;
        message: string;
        errors: Record<string, string[]>;
      };
    });
  });

  beforeEach(() => {
    mockHomeBootstrapApi();
  });

  it('creates a post and sends expected payload', () => {
    interceptEmptyPostsFeed();

    cy.intercept('POST', '**/api/posts', (req) => {
      expect(req.body.title).to.eq('Mi post Cypress');
      expect(req.body.content).to.eq('Este es un contenido de prueba largo para Cypress.');
      expect(req.body.tag_ids).to.deep.eq([10]);

      req.reply({
        statusCode: 201,
        body: {
          success: true,
          message: 'created',
          data: {
            id: 123,
            title: req.body.title,
            content: req.body.content,
            tags: ['Angular'],
            createdAt: new Date().toISOString(),
          },
        },
      });
    }).as('createPost');

    cy.visit('/home/create-post');
    cy.waitForPostsBootstrap();
    cy.createPostByUI({
      title: 'Mi post Cypress',
      content: 'Este es un contenido de prueba largo para Cypress.',
      tagName: 'Angular',
    });

    cy.wait('@createPost');
    cy.url({ timeout: 15000 }).should('include', '/home');
  });

  it('shows the created post in feed after redirect to home', () => {
    const createdPost = buildMockPost({
      id: 321,
      title: 'Post visible en feed',
      content: 'Contenido de prueba para validar render en post-list.',
      tags: ['Angular'],
    });
    let created = false;

    cy.intercept('GET', '**/api/posts*', (req) => {
      if (!created) {
        req.reply({
          statusCode: 200,
          body: emptyPostsBody,
        });
        return;
      }

      req.reply({
        statusCode: 200,
        body: {
          success: true,
          message: 'ok',
          data: [createdPost],
        },
      });
    }).as('getPosts');

    cy.intercept('POST', '**/api/posts', (req) => {
      created = true;

      req.reply({
        statusCode: 201,
        body: {
          success: true,
          message: 'created',
          data: createdPost,
        },
      });
    }).as('createPost');

    cy.visit('/home/create-post');
    cy.waitForPostsBootstrap();
    cy.createPostByUI({
      title: createdPost.title,
      content: createdPost.content,
      tagName: 'Angular',
    });

    cy.wait('@createPost');
    cy.location('pathname', { timeout: 15000 }).should('match', /\/home\/?$/);
    cy.contains('article.post-item h3', createdPost.title).should('be.visible');
  });

  it('shows backend validation message when create post returns 422', () => {
    cy.intercept('POST', '**/api/posts', {
      statusCode: 422,
      body: titleExistsValidationBody,
    }).as('createPost422');

    cy.visit('/home/create-post');
    cy.waitForPostsBootstrap();
    cy.createPostByUI({
      title: 'Titulo repetido',
      content: 'Este contenido tambien es valido y suficientemente largo.',
    });

    cy.wait('@createPost422');
    cy.get('.error-global').should('be.visible').and('contain.text', 'titulo ya existe');
  });

  it('blocks submit in client when content exceeds the maximum length', () => {
    let createRequestCount = 0;

    cy.intercept('POST', '**/api/posts', () => {
      createRequestCount += 1;
    }).as('createPost');

    cy.visit('/home/create-post');
    cy.waitForPostsBootstrap();

    cy.get('#post-title').clear().type('Titulo dentro de limite');
    cy.get('#post-content')
      .invoke('val', 'a'.repeat(1501))
      .trigger('input');

    cy.contains('button[type="submit"]', 'Publicar').click();
    cy.get('.error').should('contain.text', '1500');
    cy.then(() => {
      expect(createRequestCount).to.eq(0);
    });
  });

  it('does not show pin actions to non-admin users', () => {
    const visiblePost = buildMockPost({
      id: 11,
      title: 'Post sin pin visible',
      content: 'Contenido suficiente para comprobar permisos visuales.',
    });

    cy.intercept('GET', '**/api/posts*', {
      statusCode: 200,
      body: {
        success: true,
        message: 'ok',
        data: [visiblePost],
      },
    }).as('getPosts');

    cy.visit('/home');
    cy.waitForPostsBootstrap({ waitPosts: true });

    cy.contains('article.post-item h3', visiblePost.title)
      .parents('article.post-item')
      .within(() => {
        cy.contains('button', 'Fijar').should('not.exist');
      });
  });

  it('lets an admin pin a post and refreshes the feed with the pinned badge first', () => {
    const unpinnedPost = buildMockPost({
      id: 41,
      title: 'Post fijable por admin',
      content: 'Contenido para probar el fijado en el feed.',
      isPinned: false,
    });
    const pinnedPost = {
      ...unpinnedPost,
      isPinned: true,
    };
    let feedPinned = false;

    cy.intercept('GET', '**/api/auth/me', {
      statusCode: 200,
      body: {
        success: true,
        message: 'ok',
        data: {
          id: 99,
          username: 'admin-e2e',
          role: 'admin',
        },
      },
    }).as('authMe');

    cy.intercept('GET', '**/api/posts*', (req) => {
      req.reply({
        statusCode: 200,
        body: {
          success: true,
          message: 'ok',
          data: [feedPinned ? pinnedPost : unpinnedPost],
        },
      });
    }).as('getPosts');

    cy.intercept('POST', '**/api/admin/posts/41/pin-toggle', (req) => {
      feedPinned = true;
      req.reply({
        statusCode: 200,
        body: {
          success: true,
          message: 'Publicacion fijada correctamente.',
          data: {
            id: 41,
            isPinned: true,
          },
        },
      });
    }).as('togglePostPin');

    cy.visit('/home');
    cy.waitForPostsBootstrap({ waitPosts: true });

    cy.contains('article.post-item h3', unpinnedPost.title)
      .parents('article.post-item')
      .within(() => {
        cy.contains('button', 'Fijar').click();
      });

    cy.wait('@togglePostPin');
    cy.wait('@getPosts');

    cy.get('article.post-item').first().within(() => {
      cy.contains('h3', pinnedPost.title).should('be.visible');
      cy.get('.pin-badge').should('be.visible');
      cy.get('.pin-badge .pin-marker').should('exist');
      cy.contains('button', 'Desfijar').should('be.visible');
    });
  });

  it('lets an admin pin a root comment and refreshes the opened thread', () => {
    const post = buildMockPost({
      id: 77,
      title: 'Post con comentarios fijables',
      content: 'Contenido para probar fijado admin en comentarios.',
    });
    const initialComments = [
      {
        id: 301,
        postId: 77,
        userId: 10,
        username: 'ada',
        text: 'Comentario normal',
        createdAt: new Date().toISOString(),
        likesCount: 0,
        likedByCurrentUser: false,
        isPinned: false,
        parentId: null,
        replies: [],
      },
    ];
    const pinnedComments = [
      {
        ...initialComments[0],
        isPinned: true,
      },
    ];
    let commentsPinned = false;

    cy.intercept('GET', '**/api/auth/me', {
      statusCode: 200,
      body: {
        success: true,
        message: 'ok',
        data: {
          id: 99,
          username: 'admin-e2e',
          role: 'admin',
        },
      },
    }).as('authMe');

    cy.intercept('GET', '**/api/posts*', {
      statusCode: 200,
      body: {
        success: true,
        message: 'ok',
        data: [post],
      },
    }).as('getPosts');

    cy.intercept('GET', '**/api/posts/77/comments', (req) => {
      req.reply({
        statusCode: 200,
        body: {
          success: true,
          message: 'ok',
          data: commentsPinned ? pinnedComments : initialComments,
        },
      });
    }).as('getComments');

    cy.intercept('POST', '**/api/admin/comments/301/pin-toggle', (req) => {
      commentsPinned = true;
      req.reply({
        statusCode: 200,
        body: {
          success: true,
          message: 'Comentario fijado correctamente.',
          data: {
            id: 301,
            postId: 77,
            isPinned: true,
          },
        },
      });
    }).as('toggleCommentPin');

    cy.visit('/home');
    cy.waitForPostsBootstrap({ waitPosts: true });

    cy.contains('article.post-item h3', post.title)
      .parents('article.post-item')
      .within(() => {
        cy.contains('button.comments-toggle', '0').click();
      });

    cy.wait('@getComments');
    cy.contains('.comment-item', 'Comentario normal').within(() => {
      cy.contains('button', 'Fijar').click();
    });

    cy.wait('@toggleCommentPin');
    cy.wait('@getComments');

    cy.contains('.comment-item', 'Comentario normal').within(() => {
      cy.get('.pin-badge').should('be.visible');
      cy.get('.pin-badge .pin-marker').should('exist');
      cy.contains('button', 'Desfijar').should('be.visible');
    });
  });

  it('requests filtered feed with tag_ids[] and match when a tag is selected', () => {
    const filteredPost = buildMockPost({
      id: 500,
      title: 'Filtrado Angular',
      content: 'Resultado filtrado',
      tags: ['Angular'],
    });
    const unfilteredPost = buildMockPost({
      id: 1,
      title: 'Sin filtro',
      content: 'Listado inicial',
      tags: ['General'],
    });
    let sawFilteredRequest = false;

    cy.intercept('GET', '**/api/posts*', (req) => {
      const tagId = req.query['tag_ids[]'];

      if (tagId !== undefined) {
        sawFilteredRequest = true;
        expect(tagId).to.eq('10');
        expect(req.query.match).to.eq('any');

        req.reply({
          statusCode: 200,
          body: {
            success: true,
            message: 'ok',
            data: [filteredPost],
          },
        });
        return;
      }

      req.reply({
        statusCode: 200,
        body: {
          success: true,
          message: 'ok',
          data: [unfilteredPost],
        },
      });
    }).as('getPosts');

    cy.visit('/home');
    cy.waitForPostsBootstrap({ waitPosts: true });

    // Open category and select the tag in sidebar.
    cy.contains('summary', 'Framework').click();
    cy.contains('button.filter-tag', 'Angular').click();
    cy.wait('@getPosts');

    cy.then(() => {
      expect(sawFilteredRequest).to.eq(true);
    });
    cy.contains('article.post-item h3', 'Filtrado Angular').should('be.visible');
  });
});

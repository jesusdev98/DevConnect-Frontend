/**
 * Registers the shared mocked bootstrap traffic used by posts E2E specs.
 * Aliases exposed:
 * - @authMe
 * - @tagCategories
 * - @users
 * - @homeSidebar
 */
export const mockHomeBootstrapApi = (): void => {
  // Sesión y catálogos básicos del home.
  cy.fixture('auth/me-success.json').then((meBody) => {
    cy.intercept('GET', '**/api/auth/me', {
      statusCode: 200,
      body: meBody,
    }).as('authMe');
  });

  cy.fixture('tags/framework-angular.json').then((tagCategoriesBody) => {
    cy.intercept('GET', '**/api/tag-categories', {
      statusCode: 200,
      body: tagCategoriesBody,
    }).as('tagCategories');
  });

  cy.fixture('users/empty-success.json').then((usersBody) => {
    cy.intercept('GET', '**/api/users', {
      statusCode: 200,
      body: usersBody,
    }).as('users');
  });

  // Sidebar ligero para no depender del feed completo.
  cy.intercept('GET', '**/api/home/sidebar', {
    statusCode: 200,
    body: {
      success: true,
      message: 'ok',
      data: {
        activeDevs: [
          {
            id: 1,
            name: 'Dev One',
            username: 'devone',
            avatar: null,
            postsCount: 3,
          },
        ],
        trendingTags: [
          {
            id: 10,
            name: 'Angular',
            postsCount: 5,
          },
        ],
      },
    },
  }).as('homeSidebar');
};


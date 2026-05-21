import { buildE2ECredentials } from '../../builders/UserBuilder';

type Credentials = ReturnType<typeof buildE2ECredentials>;

describe('E2E - Search (real flow)', () => {
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

  const typeSearch = (value: string) => {
    cy.get('input.search-input', { timeout: 15000 }).should('be.visible').clear().type(value);
  };

  beforeEach(() => {
    cy.routeLaravelBrowserTraffic();
    cy.resetAuthState();
    cy.visit('/login');
  });

  it('searches a user by @username', () => {
    const actor = buildUniqueUser('search_actor');
    const target = buildUniqueUser('search_target');

    registerTestUser(actor);
    registerTestUser(target);
    loginAsUser(actor);

    typeSearch(`@${target.usuario}`);

    cy.get('ul.search-dropdown', { timeout: 15000 }).should('be.visible');
    cy.contains('li.search-suggestion .suggestion-username', `@${target.usuario}`).should('be.visible');
  });

  it('shows autocomplete suggestions with partial @query', () => {
    const actor = buildUniqueUser('auto_actor');
    const target = buildUniqueUser('auto_target');
    const partialQuery = target.usuario.slice(0, 5);

    registerTestUser(actor);
    registerTestUser(target);
    loginAsUser(actor);

    typeSearch(`@${partialQuery}`);

    cy.get('ul.search-dropdown', { timeout: 15000 }).should('be.visible');
    cy.get('li.search-suggestion').should(($items) => {
      expect($items.length).to.be.greaterThan(0);
    });
    cy.contains('li.search-suggestion .suggestion-username', `@${target.usuario}`).should('be.visible');
  });

  it('navigates to profile from search suggestions', () => {
    const actor = buildUniqueUser('nav_actor');
    const target = buildUniqueUser('nav_target');

    registerTestUser(actor);
    registerTestUser(target);
    loginAsUser(actor);

    typeSearch(`@${target.usuario}`);
    cy.get('ul.search-dropdown', { timeout: 15000 }).should('be.visible');

    cy.contains('li.search-suggestion', `@${target.usuario}`).trigger('mousedown');

    cy.url({ timeout: 15000 }).should('include', `/profile/${target.usuario}`);
    cy.get('[data-cy=profile-root]').should('be.visible');
  });
});

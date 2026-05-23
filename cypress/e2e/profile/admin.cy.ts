import { buildE2ECredentials } from '../../builders/UserBuilder';

describe('E2E - Profile Admin Delete', () => {
  let uniqueUserSeed = 0;

  const buildUniqueUser = (prefix: string) => {
    const user = buildE2ECredentials(prefix);
    const normalizedPrefix = prefix
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 8)
      .toLowerCase();
    const token = `${Date.now().toString().slice(-6)}${(uniqueUserSeed++).toString().padStart(2, '0')}`;
    const username = `${normalizedPrefix}_${token}`;

    user.usuario = username;
    user.username = username;
    user.email = `test_${normalizedPrefix}_${token}@test.com`;

    return user;
  };

  const registerTestUser = (user: ReturnType<typeof buildE2ECredentials>) => {
    return cy
      .registerByAPI({
        ...user,
        passwordConfirmation: user.passwordConfirmation,
      })
      .then((response) => {
        expect(response.status).to.eq(201);
        const persistedUsername = response.body?.data?.user?.username;
        expect(persistedUsername).to.be.a('string').and.not.be.empty;
        return persistedUsername as string;
      });
  };

  const seedAdminUser = () => {
    return cy.seedAdminUser();
  };

  const resolveBrowserBackendUrl = () => {
    const configuredBrowserBackendUrl = Cypress.env('browserBackendUrl');
    if (typeof configuredBrowserBackendUrl === 'string' && configuredBrowserBackendUrl.length > 0) {
      return configuredBrowserBackendUrl;
    }

    return Cypress.config('baseUrl') ?? 'http://127.0.0.1:4200';
  };

  const loginAsAdmin = () => {
    cy.visit('/login');
    cy.adminCredentials().then((credentials) => cy.loginByUI(credentials));
    cy.url({ timeout: 15000 }).should('include', '/home');
    cy.get('[data-cy=home-root]').should('be.visible');
  };

  const confirmAdminCanSearchUser = (username: string) => {
    return cy.window().then((win) => {
      return win
        .fetch(`${resolveBrowserBackendUrl()}/api/users?search=${encodeURIComponent(username)}`, {
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
        })
        .then((response) => {
          expect(response.status).to.eq(200);
          return response.json();
        })
        .then((body) => {
          const users = body.data ?? [];
          const persistedUser = users.find(
            (user: { username?: string }) => user.username === username,
          );
          expect(persistedUser, `persisted user ${username}`).to.exist;
          return persistedUser.username as string;
        });
    });
  };

  const confirmAdminCannotSearchUser = (username: string) => {
    return cy.window().then((win) => {
      return win
        .fetch(`${resolveBrowserBackendUrl()}/api/users?search=${encodeURIComponent(username)}`, {
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
        })
        .then((response) => {
          expect(response.status).to.eq(200);
          return response.json();
        })
        .then((body) => {
          const users = body.data ?? [];
          expect(users.some((user: { username?: string }) => user.username === username)).to.eq(
            false,
          );
        });
    });
  };

  const openCuentaWithAdminSection = () => {
    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
    cy.contains('button.tab', 'Cuenta', { timeout: 15000 }).click();
    cy.contains('Gestion de usuarios', { timeout: 15000 }).should('be.visible');
    cy.get('.admin-search-input').should('be.visible').should('not.be.disabled');
  };

  const searchVisibleAdminRow = (username: string) => {
    cy.get('.admin-search-input')
      .should('be.visible')
      .should('not.be.disabled')
      .clear()
      .type(`@${username}`, { delay: 50 })
      .blur();

    return cy
      .get(`[data-cy-admin-username="${username}"]`, { timeout: 15000 })
      .should('be.visible');
  };

  const waitForAdminDeleteCompletion = (username: string, expectedDeleteRequests = 1) => {
    cy.wait('@adminDeleteUser', { timeout: 15000 }).then((interception) => {
      cy.task(
        'log',
        `[adminDeleteUser] ${interception.request.method} ${interception.request.url} -> ${
          interception.response?.statusCode ?? 'NO_RESPONSE'
        }`,
        { log: false },
      );
      expect(interception.response?.statusCode).to.eq(200);
    });
    cy.get('[data-cy=admin-delete-success]', { timeout: 15000 }).should('be.visible');
    cy.get(`[data-cy-admin-username="${username}"]`, { timeout: 15000 }).should('not.exist');
    cy.get('@adminDeleteUser.all').should('have.length', expectedDeleteRequests);
  };

  const confirmDeleteModal = () => {
    cy.get('[data-cy=confirm-modal-confirm]', { timeout: 15000 })
      .should('be.visible')
      .click();
  };

  beforeEach(() => {
    cy.routeLaravelBrowserTraffic();
    cy.resetAuthState();
    seedAdminUser();
  });

  it('admin deletes user', () => {
    const user = buildUniqueUser('admin_delete_user');

    registerTestUser(user).then((persistedUsername) => {
      loginAsAdmin();
      confirmAdminCanSearchUser(persistedUsername).then((searchableUsername) => {
        openCuentaWithAdminSection();

        searchVisibleAdminRow(searchableUsername).within(() => {
          cy.contains('button', 'Eliminar').click();
        });

        confirmDeleteModal();
        waitForAdminDeleteCompletion(searchableUsername);
        confirmAdminCannotSearchUser(searchableUsername);
      });
    });
  });

  it('cancel delete', () => {
    const user = buildUniqueUser('admin_cancel_delete');

    registerTestUser(user).then((persistedUsername) => {
      loginAsAdmin();
      confirmAdminCanSearchUser(persistedUsername).then((searchableUsername) => {
        openCuentaWithAdminSection();

        searchVisibleAdminRow(searchableUsername).within(() => {
          cy.contains('button', 'Eliminar').click();
        });

        cy.get('[data-cy=confirm-modal-cancel]', { timeout: 15000 }).click();

        cy.contains('[data-cy=admin-user-row]', `@${searchableUsername}`, {
          timeout: 15000,
        }).should('be.visible');
      });
    });
  });

  it('cannot delete admin', () => {
    loginAsAdmin();
    openCuentaWithAdminSection();

    cy.get('.admin-search-input').clear().type('@admin', { delay: 50 }).blur();
    cy.get('[data-cy=admin-user-row]', { timeout: 15000 });

    cy.contains('[data-cy=admin-user-row]', '@admin', { timeout: 15000 })
      .should('be.visible')
      .within(() => {
        cy.contains('Administrador').should('be.visible');
        cy.contains('button', 'Eliminar').should('not.exist');
      });
  });

  it('double click delete safe', () => {
    const user = buildUniqueUser('admin_double_delete');

    registerTestUser(user).then((persistedUsername) => {
      loginAsAdmin();
      confirmAdminCanSearchUser(persistedUsername).then((searchableUsername) => {
        openCuentaWithAdminSection();

        searchVisibleAdminRow(searchableUsername)
          .find('button.admin-delete-btn')
          .should('not.be.disabled')
          .dblclick();

        confirmDeleteModal();
        waitForAdminDeleteCompletion(searchableUsername, 1);
        confirmAdminCannotSearchUser(searchableUsername);
      });
    });
  });

  it('invalid search', () => {
    loginAsAdmin();
    openCuentaWithAdminSection();

    cy.get('.admin-search-input').clear().type('@', { delay: 50 }).blur();
    cy.get('[data-cy=admin-user-row]').should('not.exist');

    cy.get('.admin-search-input').clear().type('test', { delay: 50 }).blur();

    cy.contains('Escribe @ para buscar usuarios', { timeout: 15000 }).should('be.visible');
    cy.get('[data-cy=admin-user-row]').should('not.exist');
  });
});

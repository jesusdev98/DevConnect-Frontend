import { buildE2ECredentials } from '../../builders/UserBuilder';

describe('E2E - Profile', () => {
  const authCsrfAlias = '@authCsrfRequest';
  const authChangePasswordAlias = '@authChangePasswordRequest';
  let uniqueUserSeed = 0;

  const buildUniqueProfileUser = (prefix: string) => {
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
      .its('status')
      .should('eq', 201);
  };

  const loginAsUser = (user: { usuario: string; password: string }) => {
    cy.visit('/login');
    cy.loginByUI({
      identifier: user.usuario,
      password: user.password,
    });
  };

  const seedAdminUser = () => {
    return cy.seedAdminUser();
  };

  beforeEach(() => {
    cy.routeLaravelBrowserTraffic();
    cy.resetAuthState();
    cy.visit('/login');
  });

  it('shows own profile for authenticated user', () => {
    const user = buildUniqueProfileUser('profile_own');

    registerTestUser(user);
    loginAsUser(user);

    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
  });

  it('shows public profile of another user', () => {
    const userA = buildUniqueProfileUser('profile_pub_a');
    const userB = buildUniqueProfileUser('profile_pub_b');

    registerTestUser(userA);
    registerTestUser(userB);
    loginAsUser(userA);

    cy.visitProtectedRoute(`/profile/${userB.usuario}`);
    cy.get('[data-cy=profile-root]').should('be.visible');
    cy.contains('.profile-username', `@${userB.usuario}`, { timeout: 15000 }).should('be.visible');
  });

  it('updates bio from own profile', () => {
    const user = buildUniqueProfileUser('profile_bio');
    const bioText = `Bio actualizada por Cypress ${Date.now()}`;

    registerTestUser(user);
    loginAsUser(user);

    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
    cy.contains('.profile-bio-actions button', 'Editar bio').click();
    cy.get('.profile-bio-editor #profile-bio-input').should('be.visible').clear().type(bioText);
    cy.get('.profile-bio-editor-actions .btn-bio-save').click();

    cy.contains('.profile-bio-feedback.success', 'actualizada correctamente', {
      timeout: 15000,
    }).should('be.visible');
    cy.contains('.profile-bio', bioText, { timeout: 15000 }).should('be.visible');
  });

  it('updates profile area and skills from own profile', () => {
    const user = buildUniqueProfileUser('profile_details');
    const areaText = `Estudiante de desarrollo web ${Date.now()}`;
    const skillsText = 'Angular, Laravel, TypeScript';

    registerTestUser(user);
    loginAsUser(user);

    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
    cy.openProfileAccountTab();

    cy.contains('button', 'Editar perfil profesional').click();
    cy.get('#profile-headline').should('be.visible').clear().type(areaText);
    cy.get('#profile-skills').should('be.visible').clear().type(skillsText);
    cy.contains('button', 'Guardar cambios').click();

    cy.contains('[data-cy=profile-details-success]', 'actualizado correctamente', {
      timeout: 15000,
    }).should('be.visible');
    cy.contains('.profile-role', areaText, { timeout: 15000 }).should('be.visible');
    cy.contains('.profile-hero .profile-skill', 'Angular', { timeout: 15000 }).should('be.visible');
    cy.contains('.profile-hero .profile-skill', 'Laravel', { timeout: 15000 }).should('be.visible');
    cy.contains('.profile-hero .profile-skill', 'TypeScript', { timeout: 15000 }).should(
      'be.visible',
    );
    cy.contains('.summary-value', areaText, { timeout: 15000 }).should('be.visible');
  });

  it('updates and persists profile links from own profile', () => {
    const user = buildUniqueProfileUser('profile_links');
    const githubUrl = `https://github.com/devconnect-${Date.now()}`;

    registerTestUser(user);
    loginAsUser(user);

    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
    cy.openProfileAccountTab();

    cy.get('[data-cy=profile-link-edit-github]').should('be.visible').click();

    cy.get('[data-cy=profile-link-input]').should('be.visible').clear().type(githubUrl);
    cy.get('[data-cy=profile-link-save]').should('be.visible').click({ force: true });

    cy.wait('@authProfileUpdateRequest', { timeout: 15000 }).then((interception) => {
      expect(interception.response?.statusCode).to.eq(200);
      expect(interception.request.method).to.eq('PATCH');
      expect(interception.request.body).to.have.property('links');
      expect(interception.request.body.links.github).to.eq(githubUrl);
    });

    cy.contains('.links-section a.link-anchor', githubUrl, { timeout: 15000 }).should('be.visible');

    cy.reload();
    cy.visitProtectedRoute('/profile');
    cy.openProfileAccountTab();
    cy.contains('.links-section a.link-anchor', githubUrl, { timeout: 15000 }).should('be.visible');
  });

  it('changes password from profile and can login with new password', () => {
    const user = buildUniqueProfileUser('profile_pwd');
    const newPassword = 'PasswordNueva@1';

    registerTestUser(user);
    loginAsUser(user);

    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
    cy.openProfileAccountTab();

    cy.get('[data-cy=change-password-current]').clear().type(user.password);
    cy.get('[data-cy=change-password-new]').clear().type(newPassword);
    cy.get('[data-cy=change-password-confirm]').clear().type(newPassword);
    cy.get('[data-cy=change-password-submit]').click();

    cy.wait(authCsrfAlias).its('response.statusCode').should('be.oneOf', [200, 204]);
    cy.wait(authChangePasswordAlias).its('response.statusCode').should('eq', 200);
    cy.get('[data-cy=change-password-success]')
      .should('be.visible')
      .and('contain.text', 'actualizada correctamente');

    cy.get('[data-cy=profile-logout]').click();
    cy.url({ timeout: 15000 }).should('include', '/login');

    cy.loginByUI({
      identifier: user.usuario,
      password: newPassword,
    });
    cy.url({ timeout: 15000 }).should('include', '/home');
    cy.get('[data-cy=home-root]').should('be.visible');
  });

  it('shows delete-account section for normal user in Cuenta tab', () => {
    const user = buildUniqueProfileUser('profile_delete_visible');

    registerTestUser(user);
    loginAsUser(user);

    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
    cy.openProfileAccountTab();
    cy.get('[data-cy=delete-account-section]').should('be.visible');
    cy.get('[data-cy=delete-account-button]').should('be.visible');
  });

  it('does not show delete-account section for admin in Cuenta tab', () => {
    seedAdminUser();

    cy.visit('/login');
    cy.adminCredentials().then((credentials) => cy.loginByUI(credentials));

    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
    cy.openProfileAccountTab();
    cy.get('[data-cy=delete-account-section]').should('not.exist');
  });

  it('does not delete account when confirm is canceled', () => {
    const user = buildUniqueProfileUser('profile_delete_cancel');

    registerTestUser(user);
    loginAsUser(user);

    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
    cy.openProfileAccountTab();
    cy.window().then((win) => {
      cy.stub(win, 'confirm').returns(false);
    });
    cy.get('[data-cy=delete-account-button]')
      .should('be.visible')
      .should('not.be.disabled')
      .click();
    cy.url({ timeout: 15000 }).should('include', '/profile');
    cy.url().should('not.include', '/login');
    cy.get('[data-cy=delete-account-button]').should('be.visible');
  });

  it('redirects unauthenticated user to login and never shows delete account button', () => {
    cy.resetAuthState();
    cy.visitProtectedRoute('/profile');
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.get('[data-cy=delete-account-button]').should('not.exist');
  });

  it('deletes own account for normal user and redirects to login after confirm', () => {
    const user = buildUniqueProfileUser('profile_delete_confirm');

    registerTestUser(user);
    loginAsUser(user);

    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
    cy.openProfileAccountTab();
    cy.window().then((win) => {
      cy.stub(win, 'confirm').returns(true);
    });
    cy.get('[data-cy=delete-account-button]')
      .should('be.visible')
      .should('not.be.disabled')
      .click();
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.visitProtectedRoute('/profile');
    cy.url({ timeout: 15000 }).should('include', '/login');
  });

  it('handles double click on delete account button and still redirects to login', () => {
    const user = buildUniqueProfileUser('profile_delete_double');

    registerTestUser(user);
    loginAsUser(user);

    cy.visitProtectedRoute('/profile');
    cy.get('[data-cy=profile-root]').should('be.visible');
    cy.openProfileAccountTab();
    cy.window().then((win) => {
      cy.stub(win, 'confirm').returns(true);
    });
    cy.get('[data-cy=delete-account-button]')
      .should('be.visible')
      .should('not.be.disabled')
      .dblclick();
    cy.url({ timeout: 15000 }).should('include', '/login');
    cy.visitProtectedRoute('/profile');
    cy.url({ timeout: 15000 }).should('include', '/login');
  });
});

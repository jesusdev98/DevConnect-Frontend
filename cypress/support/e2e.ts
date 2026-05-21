// Loads the shared command catalog used by all DevConnect E2E suites.
import './commands';
// Adds cy.injectAxe(), cy.configureAxe() and cy.checkA11y() to all specs.
import 'cypress-axe';

// Starts each spec from a clean browser cookie state so auth scenarios do not
// inherit session artifacts from previous tests.
beforeEach(() => {
  cy.clearAllCookies();
});

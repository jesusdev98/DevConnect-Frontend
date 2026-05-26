import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    // Cypress keeps the Angular SPA local while backend requests are rewritten
    // separately to the Laravel listener configured in env.backendUrl.
    baseUrl: 'http://127.0.0.1:4200',
    retries: {
      runMode: 2,
      openMode: 0,
    },
    env: {
      backendUrl: 'http://127.0.0.1:8001',
      adminSeedCommand: '',
      adminEmail: 'admin@devconnect.com',
      adminPassword: 'Rt9@kV2xQa',
    },
    specPattern: 'cypress/e2e/**/*.cy.{js,ts}',
    supportFile: 'cypress/support/e2e.ts',
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    viewportWidth: 1366,
    viewportHeight: 768,
    screenshotsFolder: 'cypress/screenshots',
    videosFolder: 'cypress/videos',
    screenshotOnRunFailure: true,
    video: true,
    setupNodeEvents(on) {
      on('task', {
        // Lightweight console bridge used by auth helpers during E2E diagnosis.
        log(message: string) {
          console.log(message);
          return null;
        },
      });
    },
  },
});

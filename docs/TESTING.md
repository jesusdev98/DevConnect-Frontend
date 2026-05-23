# Frontend Testing

## Scope

The frontend test strategy covers:

- Angular unit tests
- Cypress end-to-end flows
- accessibility checks in Cypress through `axe`

## Commands

```bash
pnpm test
pnpm cypress:open
pnpm cypress:run
pnpm e2e
pnpm e2e:local
```

## Notes

- `pnpm e2e` waits for the Angular dev server.
- `pnpm e2e:local` waits for both frontend and the default local backend at `127.0.0.1:8001`.
- `CYPRESS_backendUrl` overrides the backend target.
- `CYPRESS_browserBackendUrl` is needed when the browser-side API origin differs from the backend target.

## Relevant suites

- `cypress/e2e/auth`
- `cypress/e2e/posts`
- `cypress/e2e/profile`
- `cypress/e2e/search`
- `cypress/e2e/security`

Admin account management is covered in `cypress/e2e/profile/admin.cy.ts`.

# DevConnect Frontend

Angular SPA for DevConnect.

## Stack

- Angular 21
- TypeScript + SCSS
- Laravel Sanctum SPA auth through cookies and CSRF
- pnpm package workflow
- Vitest through Angular test tooling
- Cypress E2E with axe accessibility checks

## Local Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm exec cypress run
pnpm exec cypress open
```

Local URLs:

- Frontend: `http://127.0.0.1:4200`
- Backend API: `http://127.0.0.1:8001`

## Docker

The frontend image uses pnpm with a frozen lockfile and includes the Linux runtime required for headless Cypress Chromium execution.

```bash
docker compose up --build
docker compose exec frontend pnpm exec cypress run --browser chromium
```

The Docker runtime includes Chromium, Xvfb and the required GTK/NSS/audio libraries so the E2E suite can run inside Linux containers.

## Routes

- `/login`
- `/register`
- `/home`
- `/home/create-post`
- `/home/post/:id`
- `/profile`
- `/profile/:username`
- `/posts/:id`

Protected routes are guarded by Angular and backed by Laravel Sanctum session checks.

## Structure

```text
frontend/
|- src/app/
|  |- home/
|  |- profile/
|  |- services/
|  |- guards/
|  `- interceptors/
|- cypress/
|  |- e2e/
|  `- support/
`- public/
```

## Module Notes

- [Home module](./src/app/home/README.md)
- [Profile module](./src/app/profile/README.md)

## Related Docs

- [Install](../docs/INSTALL.md)
- [Testing](../docs/TESTING.md)
- [Cypress E2E](../docs/CYPRESS_E2E.md)
- [Security](../docs/SECURITY.md)

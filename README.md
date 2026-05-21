# DevConnect Frontend

Standalone Angular SPA for DevConnect.

## Stack

- Angular 21
- TypeScript, RxJS and SCSS
- Laravel Sanctum SPA authentication through cookies and CSRF
- Cypress E2E with axe accessibility checks
- pnpm

## Requirements

- Node.js 22
- pnpm 11
- A running DevConnect Laravel API for authenticated flows and E2E tests

## Local Setup

```bash
pnpm install
pnpm dev
```

Default local URLs:

- Frontend: `http://127.0.0.1:4200`
- Backend API: `http://127.0.0.1:8001`

The development environment defaults to `http://127.0.0.1:8001`. Production builds use same-origin `/api` and `/sanctum` paths by default, which keeps Sanctum cookies readable by the browser and requires the deployment platform to proxy those paths to Laravel. If you need to override that behavior, configure `public/env.js` at deploy time. This file is public and must contain only non-secret browser configuration:

```js
window.__DEVCONNECT_CONFIG__ = {
  apiUrl: 'https://your-laravel-api.example.com',
};
```

When no runtime API URL is provided in production, the app falls back to same-origin `/api` and `/sanctum` paths. That works only if the deployment platform proxies those paths to Laravel. The included `vercel.json` does this for the DevConnect Vercel deployment.

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm cypress:run
pnpm cypress:open
```

`pnpm e2e` expects the Angular dev server to already be running. `pnpm e2e:local` also waits for the default local Laravel API at `127.0.0.1:8001`.

## Cypress

Cypress uses `CYPRESS_backendUrl` to target the Laravel API when it is not running on the default local port. If the browser-side API origin differs from `http://127.0.0.1:8001`, also set `CYPRESS_browserBackendUrl`.

Admin scenarios assume the admin user already exists, or you can provide a seed command:

```bash
CYPRESS_backendUrl=http://127.0.0.1:8001 CYPRESS_adminSeedCommand="php /path/to/devconnect-backend/artisan db:seed --class=AdminUserSeeder --no-interaction" pnpm cypress:run
```

## Docker

The Dockerfile is a lightweight development/test image for the frontend repository. It installs pnpm dependencies with the committed lockfile and includes Chromium runtime packages for Cypress.

```bash
docker build -t devconnect-frontend .
docker run --rm -p 4200:4200 devconnect-frontend
```

## Production Build

```bash
pnpm install --frozen-lockfile
pnpm build
```

The Angular production output is written to `dist/frontend/browser`.

## Vercel

`vercel.json` is included for a static SPA deployment:

- install: `pnpm install --frozen-lockfile`
- build: `pnpm build`
- output: `dist/frontend/browser`
- rewrites all routes to `index.html`

For Railway/Vercel split deployment, configure Laravel CORS, Sanctum stateful domains, session cookie domain and HTTPS cookie settings to trust the Vercel frontend origin. Also proxy `/api/*` and `/sanctum/*` through Vercel so the browser keeps same-origin access to the CSRF cookie.

## Routes

- `/login`
- `/register`
- `/home`
- `/home/create-post`
- `/home/post/:id`
- `/profile`
- `/profile/:username`
- `/posts/:id`

Protected routes are guarded in Angular and enforced by Laravel Sanctum session checks.

## Structure

```text
src/app/
|- home/
|- profile/
|- services/
|- guards/
`- interceptors/
cypress/
|- e2e/
`- support/
public/
```

## Module Notes

- [Home module](./src/app/home/README.md)
- [Profile module](./src/app/profile/README.md)

# Frontend Deployment

## Runtime config

Production builds require `VITE_API_URL`.

Example:

```bash
VITE_API_URL=https://your-vercel-app.vercel.app pnpm build
```

The frontend can read browser-safe runtime configuration from `public/env.js`:

```js
window.__DEVCONNECT_CONFIG__ = {
  apiUrl: 'https://your-vercel-app.vercel.app',
};
```

This file is public and must not contain secrets.

## Same-origin production mode

In deployed browsers, `public/env.js` defaults `apiUrl` to `window.location.origin`.
This keeps Sanctum CSRF/session cookies same-origin for the SPA while Vercel proxies
`/api/*` and `/sanctum/*` to Laravel internally.

This requires the hosting platform to proxy those routes to Laravel.

## Vercel

`vercel.json` is configured for static SPA deployment:

- install command: `pnpm install --frozen-lockfile`
- build command: `pnpm build`
- output directory: `dist/frontend/browser`
- rewrite application routes to `index.html`

It also proxies `/api/*` and `/sanctum/*` for the deployed environment defined in that file.

## Docker

Build and run the frontend image:

```bash
docker build -t devconnect-frontend .
docker run --rm -p 4200:4200 devconnect-frontend
```

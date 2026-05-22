# Frontend Deployment

## Runtime config

Production builds require `VITE_API_URL`.

Example:

```bash
VITE_API_URL=https://your-laravel-api.example.com pnpm build
```

The frontend can read browser-safe runtime configuration from `public/env.js`:

```js
window.__DEVCONNECT_CONFIG__ = {
  apiUrl: 'https://your-laravel-api.example.com',
};
```

This file is public and must not contain secrets.

## Same-origin production mode

When no runtime API URL is provided in `public/env.js`, the browser falls back to same-origin `/api` and `/sanctum` paths.

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

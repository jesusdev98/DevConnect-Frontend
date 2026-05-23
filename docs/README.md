# DevConnect Frontend Docs

Quick index for frontend-specific documentation.

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [TESTING.md](./TESTING.md)
- [Home module](../src/app/home/README.md)
- [Profile module](../src/app/profile/README.md)

## Scope

This folder contains documentation that belongs to the standalone frontend repository.

Use module README files for feature-local structure and use this `docs/` folder for cross-cutting topics such as runtime configuration, deployment, testing, and frontend architecture.

Build-time note: production builds require `VITE_API_URL`, even though `public/env.js` can override the API origin at runtime.

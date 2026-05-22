# Frontend Architecture

## Overview

DevConnect Frontend is an Angular SPA that consumes a Laravel API.

The frontend owns:

- routing and guarded navigation
- form UX and client-side validation feedback
- feed and profile composition
- local UI state and optimistic interactions
- runtime API configuration through `public/env.js`

The backend remains the source of truth for authentication, authorization, validation, and persistence.

## Main areas

- `src/app/home`
  - authenticated shell with header, sidebar, feed, right aside, suggestions, and nested routes
- `src/app/profile`
  - own and public profile views, account management, admin account actions, and level UI
- `src/app/shared`
  - reusable UI pieces such as confirm modal
- `src/app/services`
  - API services and state helpers
- `src/app/guards`
  - route protection and session restoration
- `src/app/interceptors`
  - request credentials and CSRF-related behavior

## Auth model

The SPA uses Sanctum stateful auth:

1. request CSRF cookie
2. log in through the Laravel API
3. send authenticated requests with browser cookies
4. restore session state with `/api/auth/me`

No auth token is stored in `localStorage` or `sessionStorage`.

## UI notes

- Home uses a multi-column authenticated shell.
- Profile separates container orchestration from tab-level presentation.
- Destructive flows use confirmation UI before calling the backend.
- Responsive behavior is tuned for desktop, tablet, and mobile layouts.

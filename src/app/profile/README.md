# Profile Module

Short reference for `src/app/profile`.

## Purpose

The profile module separates container state from tab-level presentation.

## Components

- `profile`
  - main container;
  - resolves own profile vs public profile;
  - orchestrates profile loading, posts, follow state, bio, account settings and admin state.

- `profile-hero`
  - identity, avatar, headline, bio, skills, stats and follow action.

- `profile-posts-tab`
  - user post grid, likes and navigation to post detail.

- `profile-achievements-tab`
  - locked and unlocked achievements from `GET /api/users/{user}/achievements`.

- `profile-account-tab`
  - editable headline, skills and links;
  - password change;
  - own-account deletion for eligible users;
  - admin user search and non-admin account deletion.

- `user-level`
  - level progress from `GET /api/users/{user}/level`.

## Pattern

`Profile` keeps orchestration and passes data/actions to child components through `@Input` and `@Output`.

This keeps profile tabs isolated without changing the routed surface.

## Related Coverage

- Profile specs: `cypress/e2e/profile/profile.cy.ts`
- Admin profile specs: `cypress/e2e/profile/admin.cy.ts`

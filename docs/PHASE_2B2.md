# Phase 2B.2 — Clerk Authentication (iOS / Android)

## Changes

- Existing public `/api/health`, `/api/ready`, `/health`, `/ready` are untouched.
- New protected `GET /api/me` and `GET /api/me/settings` routes.
- Express accepts `Authorization: Bearer <Clerk session token>` only; request body identity is ignored.
- Verifies signed session tokens with Clerk; verifies the identity via Clerk backend; synchronizes users to the existing `users` table and creates settings on first sign-in.
- Settings queries are strictly scoped to the resolved local account ID. No schema migrations or modifications to the 18 tables.
- Tests use an in-memory fake auth provider and store; they **do not write to Railway**.

## Setup

1. Create a **development** application at https://dashboard.clerk.com/ and enable its Native API for Expo.
2. From Clerk Dashboard → API Keys, copy the **secret key** to `receipt-price-tracker/.env` as `CLERK_SECRET_KEY=sk_test_...`. Never put the secret in the mobile app.
3. Add `CLERK_ISSUER` (the `iss` claim of your Clerk session tokens, e.g. the instance URL). `CLERK_AUTHORIZED_PARTIES` is an optional comma-separated allowlist of intended frontends; configure when you have stable frontend origins/`azp` claims. Do not set it to localhost arbitrarily for native clients.
4. From repository root: `npm install` then `npm run typecheck --workspace @receipt-tracker/api` and `npm run test --workspace @receipt-tracker/api`.
5. `npm run db:check` and `npm audit`, then `npm run api:dev`.
6. `curl -i http://localhost:5001/api/health` → 200; `curl -i http://localhost:5001/api/me` → 401.
7. Once Expo sign-in is wired up, call `getToken()` from Clerk's `useAuth()` and send `Authorization: Bearer ${token}`. **Do not paste or log access tokens publicly.**
8. An authenticated `GET /api/me` returns `{"ok":true,"user":{"id":"1","email":"..."}}`; ID will vary. `GET /api/me/settings` returns account-only settings.

## Security / operating notes

- Authentication uses Clerk's session-token signature/expiration verification. A token lacking a valid `sub` is rejected.
- A token does **not** authorize access to an arbitrary supplied `userId`; tenant ownership always comes from the verified identity.
- For production, configure a stable Clerk issuer and authorized parties as appropriate for actual `azp` claims; use distinct Clerk instances for dev/prod.
- Profile calls and account synchronization currently occur on every authenticated request; add carefully bounded caching/identity update handling before high-traffic scaling.
- Actual sign-in UI is deferred until the Expo mobile build; Phase 2B.2 covers backend authentication contract and verification.
- Do not run tests with real credentials. Test cases mock identity resolution and storage.
- Use a dedicated Receipt Tracker Railway database, never the StoxCloud database.

# Phase 4A — Expo mobile foundation with Clerk + RevenueCat

## Scope and boundaries
- Uses current Railway API and MySQL; **no backend edits or migrations**.
- Native iOS/Android Expo Router navigation; hosted Clerk sign-in/sign-up; secure token cache; GET-only authenticated API client.
- RevenueCat SDK initializes only after a verified Clerk login, with `appUserID = Clerk user.id`. Never use an email, shared ID, or StoxCloud customer ID. The planned entitlement is `premium`.
- Monthly/annual prices TBD. 7-day trial is **not** started by the app; configure introductory trial offers in App Store Connect and Google Play Console, link products to RevenueCat offering when ready. Trial eligibility is store-determined.
- No paywall, purchases, restores, or premium backend gating yet. RevenueCat SDK entitlement reads are only UI previews, not a security boundary.

## RevenueCat account
Use your existing RevenueCat login, but **create a new project called Receipt Price Tracker** with separate iOS/Android apps, API keys, entitlements and offerings. Do not reuse StoxCloud's RevenueCat project/app keys, entitlement, user IDs or subscription products. For this app, configure entitlement `premium`, offering `default`, eventually packages monthly and annual. Never embed a RevenueCat secret API key in the native app.

## Install on Mac
1. At repo root: `unzip -o ~/Downloads/receipt-tracker-phase4a-mobile-revenuecat.zip -d .`
2. Run `bash scripts/setup-mobile-phase4a.sh` — this scaffolds Expo's current default dependency versions under `apps/mobile` and installs `@clerk/expo`, native deps, and `react-native-purchases` with Expo-compatible versions. No backend is modified.
3. `cp apps/mobile/.env.example apps/mobile/.env` and replace public Clerk key, API URL, and *optionally* public RevenueCat platform keys. Never copy the root `.env` into the mobile app.
4. Expo mobile `.env` should be excluded from git by your existing `.gitignore`. Verify `git check-ignore apps/mobile/.env` and `git status --short` before committing.
5. In Clerk Dashboard > Native applications, enable Native API. Before production builds, register final bundle ID and Android package. The sample `com.receipttracker.mobile` is a **placeholder**; choose your real unique IDs before store setup.
6. Start Express on your Mac: `npm run api:dev` from repo root. Mobile's `EXPO_PUBLIC_API_BASE_URL` must be reachable by the phone (e.g. Mac's LAN IP), and be HTTPS in production. Do not use localhost on a physical phone.
7. `npm run typecheck --workspace @receipt-tracker/mobile` and `npm run typecheck --workspace @receipt-tracker/api`.
8. `cd apps/mobile && npx expo start` for hosted Clerk auth and early UI. RevenueCat Preview API Mode in Expo Go is not real purchasing. For native subscription testing later: `npx expo run:ios` or `npx expo run:android` and configure Apple/Google sandbox accounts.

## Initial checks
- Open the app and sign in with Clerk; Home should show `/api/me` local account ID.
- Grocery screen reads `/api/grocery/products`, Gas reads `/api/gas/grades`, Receipts reads `/api/receipts`.
- User B should not see User A's private items; this depends on the existing, previously tested server authorization.
- Account screen displays RevenueCat status only if configured; no subscription paywall or trial purchase is possible at this milestone.

## API and secret separation
`EXPO_PUBLIC_*` values are embedded in the app and therefore cannot be secrets. Only Clerk publishable key, RevenueCat public app-specific keys, and the API base URL may be placed there. Clerk secret, MySQL, Railway bucket secrets, and RevenueCat secret API keys stay on the backend. Add backend entitlement verification and RevenueCat webhooks in a later phase **before enabling paid premium API access**.

## 7-day trial
Trial periods are defined per subscription product/base plan in Apple/Google store consoles, not hardcoded in JavaScript. Store-provided eligibility, current pricing, localized legal terms and consent should be shown by the eventual purchase UI. Set trial length to 7 days on eligible monthly/annual products only if that matches your final offer and store rules.

## Operational notes
- RevenueCat is a service with its own usage-based pricing, not necessarily free forever.
- No managed background workers are started here.
- Test on Expo Go before native dev builds; RevenueCat native operations require native development builds to verify real billing.
- Setup script intentionally refuses to replace existing `apps/mobile/package.json`; check whether an Expo project already exists before running.

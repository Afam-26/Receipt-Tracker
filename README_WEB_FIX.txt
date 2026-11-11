Receipt Price Tracker — Phase 4A Expo Web Clerk Fix

Problem: src/app/index.tsx used useHostedAuth(), intended for native iOS and Android,
when rendering Chrome at http://localhost:8081.

Fix: Added src/app/index.web.tsx so Expo Router renders Clerk web <SignIn /> and
<SignUp /> components in the browser. Native src/app/index.tsx remains unchanged.
No changes to API, database, RevenueCat, pricing, or subscription trial.

Install at repository root:
  unzip -o ~/Downloads/receipt-tracker-phase4a-clerk-web-fix.zip -d .

Validate:
  npm run typecheck --workspace @receipt-tracker/mobile
  cd apps/mobile
  npx expo start --web --clear

Visit http://localhost:8081 (or the port Expo prints) and use embedded Clerk sign-in.
Check EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in apps/mobile/.env (do not share secrets).

IMPORTANT for native testing: run `npx expo run:ios` from apps/mobile, not the repo
root. No iOS devices available means Xcode does not have an available Simulator.
In Xcode > Settings > Platforms, install an iOS runtime, then in Xcode > Window >
Devices and Simulators, create a simulator device, and start it.

If `npx expo run:ios` was invoked from repository root, review `git status --short`
for accidental root-level ios/ or package changes before deleting anything.
Do not run `npm audit fix --force` because it proposes breaking Expo versions.

Receipt Price Tracker — Phase 4A render-loop fix

Changes ONLY apps/mobile/src/lib/hooks.ts.

Issue:
  Home, Grocery, Gas and Receipts trigger refresh from effects that depend on
  useAuthedGet(). Clerk may return a different getToken function identity on
  subsequent renders, causing re-fetch -> state update -> re-render loops.

Fix:
  Keep getToken current in a ref and return a stable useCallback GET function.
  Always obtain the current auth token at request time. No token is cached.

Install from monorepo root:
  unzip -o ~/Downloads/receipt-tracker-phase4a-render-loop-fix.zip -d .

Validate:
  npm run typecheck --workspace @receipt-tracker/mobile
  npm run typecheck --workspace @receipt-tracker/api

Restart Expo in apps/mobile (Ctrl+C first):
  cd apps/mobile
  npx expo start --clear

If API requests still show `fetch failed`, check API separately:
  curl -i http://127.0.0.1:5001/api/health
  grep '^EXPO_PUBLIC_API_BASE_URL=' apps/mobile/.env  # run from monorepo root

On iOS Simulator, localhost/127.0.0.1 normally reaches Mac's localhost.
On physical iPhone use your Mac's LAN address (only on trusted local network).

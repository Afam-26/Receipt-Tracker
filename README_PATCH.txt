Receipt Price Tracker Phase 4B mobile patch

Files: apps/mobile/src/lib/receipts4b.ts, apps/mobile/src/app/(tabs)/receipts.tsx,
apps/mobile/src/app/receipt/[id].tsx, docs/PHASE_4B.md

No backend, DB, Clerk or RevenueCat files are changed.

Install from root:
  unzip -o ~/Downloads/receipt-tracker-phase4b-mobile-capture-review.zip -d .
  cd apps/mobile && npx expo install expo-image-picker expo-file-system
  cd ../.. && npm run typecheck --workspace @receipt-tracker/mobile

Read docs/PHASE_4B.md before launching/confirming purchases.

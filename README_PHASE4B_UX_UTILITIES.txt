Receipt Price Tracker — Phase 4B UX refinements + Utilities tab

CONTENTS:
- apps/mobile/src/app/receipt/[id].tsx: product variant search/creation, saved/unsaved status near button, image preview
- apps/mobile/src/components/ReceiptImagePreview.tsx: authenticated, temporary local preview of private receipt image on iOS/Android
- apps/mobile/src/app/(tabs)/_layout.tsx: adds Utilities to bottom tab navigation
- apps/mobile/src/app/(tabs)/utilities.tsx: utility categories and roadmap, no fake saved data

INSTALL:
cd /Volumes/Lexar/StoxCloudDev/receipt-price-tracker
unzip -o ~/Downloads/receipt-tracker-phase4b-ux-utilities.zip -d .
npm run typecheck --workspace @receipt-tracker/mobile
cd apps/mobile
npx expo start --clear

No new native modules or DB migrations. No rebuild required if the previous Phase 4B native build already has expo-file-system and expo-image-picker.

VALIDATE:
1. Open Receipt #4, tap View receipt image. It uses the existing authenticated download endpoint.
2. Tap Find or create product on the Egg line. Search and select a variant, or create a new test product (this immediately inserts catalog records in the current DB).
3. Save draft; the confirmation should appear adjacent to Save. Back out, reopen, verify values and link persisted.
4. Do NOT confirm a purchase unless you intend to create a real transaction. Confirmation remains revision-protected and explicit.
5. Open Utilities tab. It displays future bill categories but does NOT yet create utility records. Utility persistence needs a separate schema/API migration, not grocery/gas tables.

Existing API, Clerk, RevenueCat and databases are unchanged. This patch does not alter OCR recognition accuracy. Future OCR improvements should be based on inspecting a real problematic receipt and worker output, not guessing or auto-confirming incomplete values.

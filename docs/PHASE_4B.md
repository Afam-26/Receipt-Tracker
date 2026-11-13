# Phase 4B — Mobile capture, OCR and explicit review

This patch intentionally **does not alter the Express API, Railway schema, Clerk, or RevenueCat**.

## Install

From the monorepo root:

```sh
unzip -o ~/Downloads/receipt-tracker-phase4b-mobile-capture-review.zip -d .
cd apps/mobile
npx expo install expo-image-picker expo-file-system
cd ../..
npm run typecheck --workspace @receipt-tracker/mobile
npm run typecheck --workspace @receipt-tracker/api
npm run test --workspace @receipt-tracker/api
npm run db:check
```

For iOS/Android, install the new native modules in a development build. Do **not** use Expo Go:

```sh
cd apps/mobile
npx expo run:ios --device 'iPhone 17'
# Or, on an Android machine/emulator:
# npx expo run:android
```

Start both `npm run api:dev` and `npm run ocr:worker --workspace @receipt-tracker/api` in separate terminals. Use a reachable `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env`: `http://127.0.0.1:5001` for iOS Simulator; a reachable LAN/HTTPS URL for physical devices. Restart Expo when changing `.env`.

## Validation (do not confirm sample OCR guesses)

1. Sign in with Clerk. Visit Receipts: existing records must display only for the signed-in account.
2. Choose Grocery, Gas, or Detect later; take a camera photo or select a JPEG/PNG/WebP photo (at most 10 MB). Grant permissions. Validate that upload produces a new receipt.
3. Open the receipt. Tap **Start / retry OCR**. Observe processing and the `needs_review` state; check OCR worker logs if stuck.
4. Check OCR-proposed date, total, descriptions, and warnings; adjust manually. Save draft: no confirmed purchase should be created.
5. Grocery confirmation requires an **existing owned variant ID** per row, quantity, net total, valid date and grand total. The mobile UI does not auto-create products. For gas, use a valid fuel grade ID and explicitly verify before-rewards price.
6. Confirm only a **controlled fictional test receipt** (or a real receipt you intend to record). The explicit acknowledgement box must be checked; server verifies revision and ownership. Reopening a confirmed receipt should show read-only and prevent a second confirmation.
7. Test account isolation, stale-review rejection, retry after network failure, canceling permissions, wrong file type, and switching tabs during OCR.
8. Keep the Phase 3C test manifest and cleanup plan; no production purchases or receipts should be deleted indiscriminately.

## Security and limitations

- Private upload uses **raw image bytes**, not multipart or base64, matching `POST /api/receipts`.
- Never send a caller-supplied user ID. Clerk bearer token is refreshed per request.
- The server controls actual review validation, ownership, optimistic revision and exactly-once confirmation.
- For JPEG/PNG/WebP, image picker returns a local file URI that Expo File wraps as a Blob; unusual HEIC originals must be converted to JPEG before upload.
- OCR does not generate authoritative totals. Users must validate all values.
- The native image picker requires a rebuilt dev client; the 7-day RevenueCat trial is **not activated** by this patch.
- The existing API has no endpoint to link a newly extracted grocery line to a product automatically. Enter an existing owned variant ID; a searchable variant picker and product-creation workflow should be a follow-up usability improvement before launch.
- Some browser file-picker combinations cannot supply a local file URI compatible with Expo File. The acceptance target is iOS/Android native development builds.

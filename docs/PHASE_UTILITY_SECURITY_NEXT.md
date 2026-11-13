# Utility security and mobile tab icon patch

This patch intentionally does not change the live SQL schema or previously confirmed utility bills.

## Install

From the receipt-price-tracker repository root:

```
unzip -o ~/Downloads/receipt-tracker-utility-security-icons.zip -d .
export TMPDIR=/Volumes/Lexar/DevCaches/tmp/
npm run typecheck --workspace @receipt-tracker/mobile
npm run typecheck --workspace @receipt-tracker/api
npx tsx --test services/api/tests/utilities-security.test.ts
npm run test --workspace @receipt-tracker/api
```

The tests use an in-memory SQL adapter. They do not touch Railway or create test records. Expected: four utility security tests. Existing API tests are run separately by `npm run test`.

Restart Expo (`cd apps/mobile && npx expo start --clear`) to load the new icons; no native build is expected if @expo/vector-icons is already present.

## Scope and next milestone

Utility bills are already supported as manual drafts/confirmed records. Utility statement uploads and OCR are NOT implemented by this patch. The current receipt schema and ingestion worker need a deliberately reviewed extension to represent utility document types and link an OCR extraction to a utility draft; do not upload utility statements as grocery/gas to work around the missing integration.

Before enabling utility upload, inspect and validate:
- receipts.receipt_type and any associated CHECK/ENUM constraints
- receipt review draft and extraction foreign keys; whether utility receipts should bypass grocery/gas purchase_transactions
- OCR worker persistence for utility-specific candidates and the original private image download path
- source_receipt_id ownership check and one-confirmation/idempotency behavior
- existing mobile receipt picker API shape

Suggested follow-up is a separate migration and upload/OCR patch after verifying these constraints; do not alter migration 0002 after application because the migration runner verifies checksums.

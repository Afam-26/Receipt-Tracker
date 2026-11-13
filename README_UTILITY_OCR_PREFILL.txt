Receipt Price Tracker — Utility OCR-assisted prefill (Stage 2)

This patch does NOT add external AI or transmit bill content to a new service.
It uses the existing authenticated OCR extraction, then pre-populates the mobile utility form with validated, unverified suggestions.
Nothing is saved or confirmed automatically. The statement is NOT yet linked via source_receipt_id.

INSTALL (from repository root):
  unzip -o ~/Downloads/receipt-tracker-utility-ocr-prefill-stage2.zip -d .
  python3 scripts/apply-utility-ocr-prefill.py
  export TMPDIR=/Volumes/Lexar/DevCaches/tmp/
  npm run typecheck --workspace @receipt-tracker/mobile
  npm run typecheck --workspace @receipt-tracker/api
  npx tsx --test apps/mobile/src/lib/utility-prefill.test.ts

TEST: Open a utility receipt with completed OCR and tap 'Review OCR in Utilities (prefill draft)'.
Review all fields. For waterfall receipt #5, fields should remain empty, and no bill created.
Use a fictional example bill with visible labeled data for further tests.

No native dependencies or database migration. Existing confirmed utility bill #1 is untouched.
To enable AI cloud extraction in future, explicitly opt in and configure a provider, privacy policy and API key; do not embed keys in EXPO_PUBLIC_*.

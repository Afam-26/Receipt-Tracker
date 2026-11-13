# Utility OCR Stage 1 — private uploads and unverified extraction

## Scope
- A new, standalone `0003_utility_receipt_type.sql` migration extends `receipts.receipt_type` to include `utility`. It does not change `0001` or `0002` and does not change `utility_bills`.
- iOS/Android receipt choice **Utility** uploads to the same authenticated private Railway bucket using the existing MIME/signature/size checks and per-user ownership.
- OCR worker accepts the receipt's *declared* `utility` type and suggests provider, service dates, due date, usage, unit, rate, total and category. Data is unverified, never automatically confirmed, and the parser does **not** create a utility bill.
- On the receipt detail screen, utility OCR suggestions are shown read-only, with an **Open Utilities** action. Use the Utilities tab to manually enter a draft after checking the original statement. This is a first-stage integration, not an automatic import or linked source receipt.
- Grocery and gas purchase confirmation remains restricted to their existing workflow; utility OCR must not create a grocery purchase.

## Installation (from repo root)
1. Ensure changes are backed up/committed before running any patch script. Inspect `git status --short`.
2. Unzip the package at the repo root and run `python3 scripts/apply-utility-ocr-stage1.py` **once**. The script checks exact expected code spans before writing, and stops safely when a different version is found.
3. Run `npm run typecheck --workspace @receipt-tracker/api`, `npm run typecheck --workspace @receipt-tracker/mobile`, `npm run test --workspace @receipt-tracker/api`, and `npx tsx --test services/api/src/ocr/utility-extract.test.ts`.
4. **Before database migration:** take a fresh restorable Railway DB backup. Check the migration journal to ensure `0003_utility_receipt_type.sql` is not applied and inspect the SQL. Once code tests pass, run `npm run db:migrate`. Do not edit applied migration files or run the migration before tests pass.
5. Restart both the API and the OCR worker on your Mac (the worker must use the new code). Reload Expo JS; a native rebuild is unnecessary for this TypeScript-only change.
6. Test with a fictional sample image. Select **Utility** in Receipts, select an image, run OCR, and view suggestions. Check `GET /api/receipts` shows type utility. Do not confirm any grocery/gas purchase. After comparing against the image, manually enter a new draft in Utilities and validate it separately.

## Important limitations and safety
- Upload currently uses Expo image picker: JPEG, PNG, WebP. The backend also supports PDF, but a PDF document picker is not included in this patch.
- Text extraction uses existing self-hosted Tesseract and a conservative parser. Real-world bills vary dramatically; expect missing fields. No service dates, payment amounts or categories should be inferred from other values.
- An uploaded utility statement is not yet linked via `utility_bills.source_receipt_id`, and OCR does not prefill the Utilities form automatically. Those require a dedicated authenticated review/update endpoint with same-owner source receipt validation, plus live coverage.
- `Detect later` continues to use conservative existing grocery/gas OCR inference. To get utility suggestions, explicitly select **Utility** before uploading.
- Existing receipt review/confirm routes must not be used for utility bills. Utility bill confirmation remains available only in the Utilities tab.
- `0003` is an ENUM alteration. MySQL may rebuild/lock the receipts table while applying it. Back up first, apply during development downtime and verify before uploading.
- Do not treat a successful typecheck as proof of Railway migrations or end-to-end OCR; test the complete flow.

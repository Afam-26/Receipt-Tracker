# Phase 3C — OCR receipt review and explicit confirmation

This patch overlays the **validated Phase 3B** API. No schema changes. It adds only `services/api/src/review/`, two test files, and updates the API's `app.ts` and `server.ts`. It does **not** replace the working grocery, gas, analytics, storage or OCR modules.

**BEFORE INSTALLING:** Commit your validated working tree after checking `.gitignore` excludes `.env`, auth tokens and private files. This adds a **real confirmation operation** that writes transactions into confirmed analytics. Do NOT run a confirmation on production or real receipts until you have inspected and corrected every detail. Never confirm the fictional `receipt 2` smoke-test example in production.

## Endpoints (all authenticated with Clerk)

- `GET /api/receipts/:receiptId/review` — fetch owner-scoped OCR extraction and latest draft, with `revision` and `extraction.id`. Never returns object-storage keys; response `Cache-Control: private, no-store`.
- `PUT /api/receipts/:receiptId/review` — save an **entire reviewed draft**. Body `{ "expectedRevision": null, "draft": {...} }` on first save. Later sends latest `revision` string as `expectedRevision`, rejecting stale edits (409). The `draft.extractionId` must match the latest extraction ID. Stores a version in `receipt_review_issues`, plus an audit entry. Works only while receipt is `needs_review`.
- `POST /api/receipts/:receiptId/review/confirm` — body `{ "expectedRevision": "<latest review revision>", "acknowledged": true }`. Server rereads draft under a row lock, strictly validates reviewed values, checks all foreign keys belong to the same account, atomically inserts a **confirmed, source_kind='receipt'** purchase and grocery lines or gas purchase, sets receipt `confirmed`, resolves open review issues, and records an audit event. A duplicate or competing confirmation is rejected. It does **not** trust caller-supplied user IDs, source-transaction IDs, transaction status, or receipt IDs.

## Example grocery draft (save only, not confirmation)

```json
{
  "expectedRevision": null,
  "draft": {
    "extractionId":"<from GET review>",
    "receiptType":"grocery",
    "purchasedOn":"2026-11-10",
    "merchantId":null,
    "grandTotal":"22.76",
    "items":[
      {"rawDescription":"MILK","variantId":null,"quantityPurchased":"1","netLineTotal":"4.29"},
      {"rawDescription":"BREAD","variantId":null,"quantityPurchased":"1","netLineTotal":"3.49"}
    ]
  }
}
```

This draft **cannot be confirmed** until every grocery line has an **owned, validated variant ID**, a quantity, and a line net total. The complete list must accurately represent the receipt; fields are not automatically copied from OCR. Variants can be created with the existing grocery endpoints. Merchant ID is optional, but if supplied must belong to the authenticated user.

For gas drafts, set `receiptType: "gas"`, omit `items`, and provide `gas` with `fuelGradeId`, `rawFuelGrade`, `regularPricePerGallon`, `rewardDiscountPerGallon`, `paidPricePerGallon`, `gallons`, `totalPaid`, `priceSource` (`printed` or `confirmed`). All prices must be verified by the reviewer. **Before-rewards prices are never inferred from paid prices**; paid + discount must equal original when all are provided. Confirmation requires a date, fuel grade, original price, gallons and paid total.

The app's mobile UI in a later phase should present the source receipt next to OCR suggestions and the editable draft; saving is distinct from confirming. `receiptType='mixed'` or `unknown` must be classified as grocery or gas by the reviewer before confirmation.

## Local validation

```bash
cd /Volumes/Lexar/StoxCloudDev/receipt-price-tracker
unzip -o ~/Downloads/receipt-tracker-phase-3c-review-patch.zip -d .
npm install
npm run typecheck --workspace @receipt-tracker/api
npm run test --workspace @receipt-tracker/api
npm run db:check
npm audit
```

Expected: 18 tables. Previous full suite had 73 passing tests; this patch adds nine tests. Test count can vary if tests are added later.

To inspect the saved OCR extraction without printing OCR contents or secrets, use `export CLERK_TEST_USER_A_ID="<your test user>"; export OCR_TEST_RECEIPT_ID=2; node scripts/review-inspect.mjs` with the API running. It prints only presence/counts and IDs.

To smoke-test API authorization, run `npm run api:dev` and in another terminal `curl -i http://localhost:5001/api/receipts/2/review` (expect HTTP 401). An authenticated `GET /api/receipts/2/review` should return a completed extraction; this can be tested with your existing Clerk development session flow. Do not post a review confirmation merely to smoke-test the endpoint—confirmation changes financial records.

## Boundaries

- No currency conversion or automatic normalization is performed.
- A confirmed receipt is immutable here. A dedicated audited correction/void/refund workflow is still required for production changes.
- This version confirms only single-type grocery or single-type gas receipts. Mixed receipts need a later multi-transaction review flow.
- The server only stores explicit corrected values; extraction remains available for comparison.
- Work done in this patch is code/tests; a real account-scoped database confirmation has **not** been executed. Do not claim live validation until that is run deliberately against a disposable staging receipt.

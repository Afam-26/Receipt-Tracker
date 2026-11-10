# Phase 2B.5 — Advanced analytics API

## Scope
Additive, read-only analytics endpoints. No migration, no writes to purchase data, and no updates to existing grocery or gas endpoints. Clerk middleware identifies the local owner; caller-provided `userId` is ignored.

### New API routes (Bearer token required)

- `GET /api/analytics/grocery/trends?productId=ID&limit=50&offset=0[&variantId=ID][&merchantId=ID][&from=YYYY-MM-DD][&to=YYYY-MM-DD]`
- `GET /api/analytics/grocery/merchants?productId=ID&limit=50&offset=0[&variantId=ID][&merchantId=ID][&from=...][&to=...]`
- `GET /api/analytics/gas/dashboard?limit=50&offset=0[&fuelGradeId=ID][&merchantId=ID][&from=...][&to=...][&mode=previous|lowest]`

All endpoints return `{ "ok": true, "data": ... }`. A missing or foreign-owned `productId` returns HTTP 404. Dates and pagination are validated. Limits are 1-100; offset at most 1,000,000.

## Grocery analytics rules

- Both the transaction and line item must be **confirmed**; transactions need a real purchase date, item quantity > 0, and an explicit net total.
- Duplicate/repeated receipt lines remain separate observations. Incomplete or review-needed lines do not contaminate comparisons.
- `pricePerPackage = netLineTotal / quantityPurchased`, where quantityPurchased denotes packages purchased.
- Explicit variant `packageQuantity` and `packageUnit` permit comparisons per **100 g** (g/gram/grams/kg/oz/lb/lbs) or **100 mL** (ml/l/liter/fl oz/floz); a package unit of `each`, `ct`, or `count` uses packageQuantity or unitCount to compare **each**. Unknown or inconsistent units yield null normalized price. No guessed package measurements.
- Cross-variant/merchant comparisons are meaningful only when *productId* and **comparison basis** agree; no cross-product aggregation. The trend's change vs preceding observation is calculated only for the same variant and same basis, ordered by purchase date and line ID.
- Monetary math is performed with BigInt fixed-point integers and output strings to four decimal places. Average normalized prices are an **unweighted average of the confirmed line observations** on the selected page, not a volume-weighted average and not a store-wide claim.
- Merchant comparison summaries are **page-local** and `pagination.hasMore` indicates a potentially incomplete view. If all observations are desired, request successive pages and aggregate them client-side or implement a dedicated fully paginated aggregation later.
- Merchant name is joined from an account-scoped merchant, when one was assigned.

## Gas dashboard rules

Top-level response order is `fuelAssumptions`, `priceIncreaseRankings`, `allRecordedGasEntries`, `allGasPurchases` as requested, with separate `confirmedChartHistory`, `costImpact`, and pagination fields. The two recorded purchase lists reflect the existing gas list endpoint (including review-needed rows). `confirmedChartHistory` and rankings use **confirmed** records with explicit *before-rewards* fuel prices and verified grades. Same-grade ranking and annual/monthly cost math are reused from Phase 2B.4, with no duplicate formulas.

`allRecordedGasEntries`, `allGasPurchases`, and confirmed history are **paginated**, not complete in a single response when more than `limit` entries exist. Use `offset` for successive pages; `hasMore` is conservative when a page is full. Ranking pagination is applied to the computed rankings and is not a global count.

## Install on the validated Phase 2B.4 project

```bash
cd /Volumes/Lexar/StoxCloudDev/receipt-price-tracker
# Back up or commit current code first, and ensure .env / secrets are ignored.
unzip -o ~/Downloads/receipt-tracker-phase-2b5-analytics-patch.zip -d .
npm install
npm run typecheck --workspace @receipt-tracker/api
npm run test --workspace @receipt-tracker/api
npm run db:check
npm audit
npm run api:dev
```

Unauthenticated smoke checks should give HTTP 401:

```bash
curl -i 'http://localhost:5001/api/analytics/grocery/trends?productId=1'
curl -i 'http://localhost:5001/api/analytics/gas/dashboard'
```

Authenticated smoke tests should use a development Clerk token. Read-only analytics should show no confirmed rows for an account with only the previous `needs_review` test purchases. Do **not** turn a test purchase into a real confirmed transaction merely to populate charts. Use legitimate confirmed test data in a separate development environment when validating prices.

## Files

New: `services/api/src/analytics/{calculations,validation,store,routes}.ts`; new tests: `services/api/tests/{analytics,analytics-calculations}.test.ts`; modified: `services/api/src/{app,server}.ts`; this document.

No modifications to the existing database migration, auth middleware, grocery module, gas module, environment files, or package manifest.

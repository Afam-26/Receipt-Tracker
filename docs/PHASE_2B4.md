# Phase 2B.4 — Gas APIs (iPhone/Android backend)

## Scope
Additive backend patch: services/api/src/app.ts and server.ts gain the gas module; new services/api/src/gas/*; tests. Existing grocery, Clerk, migrations and 18 tables are unchanged.

## Install
From `receipt-price-tracker` root:

```sh
# make a backup / commit before overwriting two API bootstrap files
unzip -o ~/Downloads/receipt-tracker-phase-2b4-gas-patch.zip -d .
npm install
npm run typecheck --workspace @receipt-tracker/api
npm run test --workspace @receipt-tracker/api
npm run db:check
npm audit
npm run api:dev
```

## Endpoints (all require Clerk Bearer token)

| Verb | Route | Notes |
|---|---|---|
| GET | /api/gas/grades | Read global standardized fuel grades |
| GET | /api/gas/purchases | Paginated purchase list; `from`, `to`, `merchantId`, `fuelGradeId`, `limit`, `offset` |
| POST | /api/gas/purchases | Create atomic transaction + fuel line; requires `sourceTransactionId` |
| GET | /api/gas/purchases/:gasId | Owner-scoped purchase detail |
| PUT | /api/gas/purchases/:gasId | Edit draft/needs_review only; confirmed corrections are deferred to a dedicated audited workflow |
| GET | /api/gas/history | Verified dated entries for main chart (paginated; use limit/offset to get all) |
| GET | /api/gas/rankings | Price increases; `mode=previous` or `mode=lowest` |
| GET | /api/gas/impact | Latest confirmed dated entry versus immediately prior matching grade, across entire history |
| GET | /api/gas/settings | Fuel assumptions |
| PATCH | /api/gas/settings | Update gallonsPerFillup and fillsPerWeek |

`/api/gas/history` and rankings use **regular before-rewards prices** only. Unknown grade/date/regular price and unconfirmed purchases are excluded. Each chart record carries station, gallon count, discounts and receipt reference (when recorded). Reward-adjusted prices are retained separately. Comparisons use exact standardized fuel grade IDs, never cross Regular/Plus/Super. A grade group may have separate octane variants; mapping is explicit and not inferred from station naming.

Annual cost uses 52 weeks; monthly = annual/12. Negative values are savings. The latest impact is unavailable if there is no previous purchase of the same grade. All calculations use fixed-point decimal arithmetic with signed cents. `percentageIncrease` is null when previous price is zero.

## Optional development fuel-grade setup

The original migration creates `fuel_grades` but does not populate it. **On a dedicated development database**, inspect with:

```sql
SELECT id, canonical_name, grade_group, octane_rating FROM fuel_grades;
```

If empty, run the SQL included in `scripts/seed-fuel-grades.sql` manually. It seeds broad generic Regular, Plus and Super grade IDs; it does **not** assert station-specific octane equivalence. Never map ambiguous raw grades automatically. Fuel grades are read-only through this API.

## Example request

```json
{
  "sourceTransactionId":"mobile-gas-unique-key-001",
  "purchasedOn":"2026-11-09",
  "merchantId":null,
  "receiptId":null,
  "status":"confirmed",
  "fuelGradeId":"1",
  "rawFuelGrade":"Regular",
  "regularPricePerGallon":"3.4990",
  "rewardDiscountPerGallon":"0.3000",
  "paidPricePerGallon":"3.1990",
  "gallons":"13.0000",
  "totalPaid":"41.59",
  "priceSource":"printed"
}
```

This JSON is an example, not a real purchase. `fuelGradeId` must be the actual ID from GET /api/gas/grades. Verified `regularPricePerGallon` must originate from a receipt or user review, not an inference based on discounts alone. The API rejects inconsistencies among all three provided prices. Totals are intentionally not recomputed when the receipt includes taxes or other charges; reconciliation is a later feature.

## Safety & limitations

- Never submit a public URL containing a Clerk token; use an Authorization Bearer header. The test suite mocks Clerk; a live Clerk+MySQL integration test remains pending.
- Client supplies a unique, stable sourceTransactionId for every purchase. Duplicate keys produce 409.
- Before-rewards prices are not derived when source information is incomplete. If derived, `priceSource=derived` and explicit paid price + reward are required.
- User ID is resolved from verified Clerk identity, never accepted from the request.
- Only draft/review purchases are editable through PUT. Confirmed records need an audited correction flow built in a later milestone.
- Main chart can retrieve complete history using paginated reads; rankings compute full filtered history before pagination.
- The generic fuel grade seed is optional; it never modifies existing transactions.
- Source file and database migrations are not part of this patch. Verify schema and audit after installing.

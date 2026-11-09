# Phase 2B.3 — Grocery APIs (additive patch)

Apply this ZIP **at the root** of the existing `receipt-price-tracker` repository. It only adds the `services/api/src/grocery` module and its tests, and modifies `services/api/src/app.ts`, `server.ts`, and `auth/routes.ts`. It does not replace your `.env`, `package.json`, MySQL migrations, or the existing database. Keep a backup of local edits before overwriting these three files.

## Installation

```bash
cd /Volumes/Lexar/StoxCloudDev/receipt-price-tracker
unzip -o ~/Downloads/receipt-tracker-phase-2b3-grocery-patch.zip -d .
npm install
npm run typecheck --workspace @receipt-tracker/api
npm run test --workspace @receipt-tracker/api
npm run db:check
npm audit
npm run api:dev
```

Your existing Clerk variables and database URL remain unchanged. All grocery endpoints require the `Authorization: Bearer <Clerk session token>` header. A request without it should return HTTP 401.

## Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/grocery/categories` | List own categories |
| POST | `/api/grocery/categories` | Create category (`name`, optional `parentId`) |
| GET | `/api/grocery/products` | Search own products (`categoryId`, `search`) |
| POST | `/api/grocery/products` | Create product (`canonicalName`, optional `brand`, `categoryId`) |
| GET | `/api/grocery/variants` | List variants (`productId`, `categoryId`, `search`) |
| POST | `/api/grocery/variants` | Create variant (`productId`, `variantName`, optional size fields) |
| GET | `/api/grocery/purchases` | Filter purchases by `merchantId`, `variantId`, `productId`, `categoryId`, `search`, `from`, `to` |
| POST | `/api/grocery/purchases` | Save an atomic manual transaction and its line items |
| GET | `/api/grocery/purchases/:purchaseId` | Read purchase with its line items |
| GET | `/api/grocery/variants/:variantId/history` | Verified same-variant price history |

All list endpoints support `limit` (default 50, maximum 100) and `offset` (default 0). IDs are returned as strings (or database-driver-compatible integer values on some list responses); monetary values from MySQL are decimal strings. Avoid JavaScript `Number` for persistent financial calculations.

Create a manual purchase with a **unique stable** `sourceTransactionId` (client-generated UUID recommended), `purchasedOn`, `status` (`draft`, `needs_review`, `confirmed`) and `items` (1–100). `items` contain `rawDescription`, optional `variantId`, `quantityPurchased`, `measurementUnit`, `measuredAmount`, `listedUnitPrice`, `grossLineTotal`, `netLineTotal`. Optional purchase fields: `merchantId`, `receiptId`, `subtotal`, `taxTotal`, `discountTotal`, `grandTotal`.

Example (send with a valid Clerk token):

```json
{
  "sourceTransactionId": "mobile-a5d53fba-8e26-4e03-82a1-43c6a59098b6",
  "purchasedOn": "2026-11-09",
  "status": "needs_review",
  "merchantId": null,
  "items": [
    {"rawDescription": "H-E-B Organic Baby Spinach", "quantityPurchased": "3", "netLineTotal": "14.85"}
  ]
}
```

This is a **manual purchase API**, not an OCR upload endpoint. Existing receipt entries may reference a previously created receipt ID, but receipt upload will be built in Phase 4. A `confirmed` purchase requires a date and every item to have a variant, quantity, and net line total. No missing values are invented, and identical repeated lines are retained with distinct line IDs. A duplicate `sourceTransactionId` returns HTTP 409. Same-variant history uses confirmed transactions and line items only, returning a per-purchased-unit price where quantity is known. Comparing different package sizes by weight/volume is reserved for later analytics work.

**Known remaining work:** authenticated live integration testing against Railway using a real Clerk session; adding merchants management; correction/edit endpoints with audit logging; refunds/discount adjustments; receipt ingestion; duplicate fingerprint checks beyond the source transaction key; normalized-unit analytics. Do not deploy this milestone as a complete production grocery workflow yet.

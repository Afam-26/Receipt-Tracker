# Receipt Price Tracker — Utility Bills (additive phase)

## Source-design reference
The supplied HTML prototype has separate Grocery and Gas sections, category/date filters, summary stats, rankings, charts, histories, add forms and CSV export. The new Utilities tab follows that information hierarchy and the green/white visual language; it does **not** import the demo records embedded in the HTML. The Grocery/Gas mobile screens and original prototype data are not overwritten by this patch.

## Safety / what is complete
- A new `utility_bills` table, separate from the 18 existing grocery/gas/receipt tables. No change to `receipts.receipt_type` or OCR classifier.
- Clerk-owned utility bill CRUD: list/create/edit draft, explicit confirmation; no automatic bill confirmation.
- Exact-owner access control via a **required** injected `ownerId` callback from your already verified Clerk + local-user-sync middleware. Never accept owner/user IDs from request bodies.
- Idempotency key per new bill; optimistic revision for edits/confirmation; status prevents double-confirm.
- Confirmed-bill summary, comparisons of previous bills of *same provider and category*, and owner-scoped CSV export.
- Mobile manual utility bill entry, categories, billing period and usage, summary, ranking, history and confirmation.

## NOT COMPLETE
- Uploading utility bill photos into the Railway private bucket and utility-specific OCR. The current receipt upload API permits grocery/gas/unknown; do **not** route utility bills through grocery or gas and do not mark utility OCR as implemented.
- Native CSV download/share button. Authenticated backend export exists at `GET /api/utilities/bills/export.csv`; avoid embedding session credentials in a URL.
- Migration integrated into live DB, server router mounted, full TypeScript typecheck and device validation. These require the current codebase on the Mac; none were executed against Railway here.
- Mobile edit form for existing drafts: backend PUT exists but the initial mobile UI creates drafts and confirms them. Later UX can add editing.
- Automatically distinguishing rate-driven bill increases from usage-driven increases: rankings explicitly label them as *bill total increases*.

## Installation (source files only)
```bash
cd /Volumes/Lexar/StoxCloudDev/receipt-price-tracker
unzip -o ~/Downloads/receipt-tracker-utilities-backend-mobile.zip -d .
```
This patch overwrites only `apps/mobile/src/app/(tabs)/utilities.tsx`; all API and migration paths are **new**. Review with `git diff` / `git status` before applying migrations.

## Database migration — do not run blindly
Verify current DB backup and inspect `SHOW CREATE TABLE users;`, `SHOW TABLES LIKE 'utility_bills';` and your `schema_migrations` ordering. The provided migration file is `packages/database/migrations/0002_utility_bills.sql`. If `0002` already exists in your actual repository, **rename and register the migration with the next available sequence number**; do not replace existing migration checksums. It creates a single new table and does not touch the 18 existing tables. You can test `npm run db:migrate` on a restored database first. A successful setup normally has **19** application tables, though your existing `db:check` script may still report "Verified 18 application tables" until its expected-table list is updated.

## Mount the utility router in the existing Express app
`services/api/src/utilities/routes.ts` exports:

```ts
createUtilityRouter({
  pool,                           // mysql2/promise Pool connected to existing Railway database
  ownerId: (req) => localUserId, // verified LOCAL users.id, never Clerk subject or request-supplied userId
})
```

**IMPORTANT:** Your existing server/auth middleware names are not available in this attachment. Do not paste placeholder imports and assume they are functional. Mount it **after** your existing authenticated Clerk middleware and the Clerk-subject-to-local-users synchronization middleware, e.g.:

```ts
import { createUtilityRouter } from './utilities/routes';
// ... inside the existing API router setup, after middleware that verifies Clerk and resolves local user:
app.use('/api/utilities', existingVerifiedClerkAuth, existingLocalUserSync,
  createUtilityRouter({
    pool: existingMysql2Pool,
    ownerId: (req) => /* return verified local users.id from your established auth context */ null,
  })
);
```

The `null` placeholder is **intentional fail closed** (401); replace with your real verified owner resolver by inspecting existing grocery/gas routes. Do not use `req.body.userId`, query strings, or unverified `req.user.id`. If the API already mounts an authenticated `/api` router, mount directly in that context and reuse its resolved local account ID. The utility router refuses requests without a valid authenticated numeric local ID.

## Endpoints (mount base `/api/utilities`)
- `GET /bills?category=&from=&to=&limit=100` list owner-scoped draft/confirmed bills
- `POST /bills` create draft; requires unique `idempotencyKey` and bill details
- `GET /bills/:id` read owned bill
- `PUT /bills/:id` update draft, requires `expectedRevision` + original `idempotencyKey`
- `POST /bills/:id/confirm` `{ "expectedRevision": 1, "acknowledged": true }` -> 201 or 409
- `GET /summary` confirmed bill statistics; category/date filtering
- `GET /rankings` comparative confirmed bill increases for same category+provider
- `GET /bills/export.csv` owner-authenticated CSV (limit <=500)

Example **draft** JSON (all amounts are strings to protect decimal precision):
```json
{
  "idempotencyKey": "demo-utility-bill-unique-001",
  "category": "electricity",
  "providerName": "Example Utility",
  "serviceStart": "2026-10-01",
  "serviceEnd": "2026-10-31",
  "dueDate": "2026-11-15",
  "accountLabel": null,
  "usageAmount": "450.0000",
  "usageUnit": "kWh",
  "ratePerUnit": "0.125000",
  "baseCharge": "15.00",
  "taxesFees": "5.00",
  "totalAmount": "76.25",
  "notes": null
}
```
The API never guesses or calculates the bill total from usage/rate. Test with fictitious records only on your current prelaunch DB.

## Validation on your Mac
```bash
npm run typecheck --workspace @receipt-tracker/mobile
npm run typecheck --workspace @receipt-tracker/api
npx tsx --test services/api/src/utilities/validation.test.ts
npm run test --workspace @receipt-tracker/api
npm run db:check
```
Run the database migration only after review and backup. Start your API and test owner A/B isolation, stale PUT, missing acknowledgment, repeat confirm, draft exclusion from summary/rankings, and CSV access via authenticated request (no tokens in URL). On the simulator restart Metro; no new native packages if `expo-crypto` is already installed by your SDK 58 project.

## Design follow-on
The user-provided prototype includes detailed Grocery and Gas charts and CSV imports/exports. Phase 4B already has grocery/gas backend analyses, so migrating those exact panels to native mobile charts can be a separate presentation patch after this utility API is connected; no historical fixture data from the HTML should be automatically written to Railway.

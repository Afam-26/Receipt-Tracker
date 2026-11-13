# Utility integration — existing Receipt Price Tracker API

This additive patch changes only `services/api/src/app.ts`, `services/api/src/server.ts` and the NOT-YET-APPLIED `packages/database/migrations/0002_utility_bills.sql`. It expects the Utilities backend files from `receipt-tracker-utilities-backend-mobile.zip` to be present, with `.js` import fixes already applied.

The supplied app.ts / server.ts match the user's November 12 shared source. If these files have since changed locally, inspect `git diff` and merge before installing.

### Security
* `createRequireUser(auth)` verifies the Clerk token, synchronizes local user, and assigns `authenticatedUser`.
* The Utility Router reads only `authenticatedUser.id`; no caller-supplied user ID.
* A dedicated mysql2/promise pool is closed in shutdown.
* `createApp` still excludes Utility routes when auth or pool isn't supplied (unit-test compatibility).

### IMPORTANT — migration
* The new migration fixes `ON UPDATE CURRENT_TIMESTAMP(3)` and adds `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`. User PK `BIGINT UNSIGNED` matches.
* Before migrating: backup current Railway MySQL. Read `packages/database/scripts/migrate.ts` to understand tracking and splitting, check `SHOW TABLES LIKE 'utility_bills'`, inspect `schema_migrations` or migration journal. A database backup should be restorable.
* Only after review run your normal migration command. Do **not** copy/paste `CREATE TABLE` into production as a workaround without checking journal state.
* Utility OCR and receipt classification remain out of scope; DO NOT route Utility through Grocery/Gas.

### Test before migration
```
cd /Volumes/Lexar/StoxCloudDev/receipt-price-tracker
export TMPDIR=/Volumes/Lexar/DevCaches/tmp/
npm run typecheck --workspace @receipt-tracker/api
npm run typecheck --workspace @receipt-tracker/mobile
npx tsx --test services/api/src/utilities/validation.test.ts
npm run test --workspace @receipt-tracker/api
```

### After migration and starting API
Unauthenticated check should return HTTP 401: `curl -i http://127.0.0.1:5001/api/utilities/bills`.
Authenticated checks should confirm owner A cannot read/update B's bill, draft not in summary, revision conflicts on edits, acknowledge required, repeated confirms conflict and other existing API flows remain unchanged.

Notes: backend utility route tests covering these cases are not yet included in this patch; the 4 utility tests are pure validation tests, not integration tests.

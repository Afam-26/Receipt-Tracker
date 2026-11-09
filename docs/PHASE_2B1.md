# Phase 2B.1 — Express API foundation

## What changes
Only `services/api/` files. No SQL migration; no changes to existing MySQL tables.

## Installation into an already initialized Phase 2A project
Copy the `services/api/` directory from this patch into your existing `receipt-price-tracker/services/api/`. Review the change to `services/api/package.json` before overwriting; only the `test` script is new. Do not replace `.env`, `package-lock.json`, Drizzle ORM version, the database migration, or database schema.

From the project root:

```sh
npm install
npm run typecheck --workspace @receipt-tracker/api
npm run test --workspace @receipt-tracker/api
npm run api:dev
```

Then from a second terminal:

```sh
curl -i http://localhost:5001/api/health
curl -i http://localhost:5001/api/ready
curl -i http://localhost:5001/api/unknown
```

- `/api/health`: 200 if the Express process is running, even when the DB is unavailable.
- `/api/ready`: 200 if MySQL accepts `SELECT 1`, otherwise 503.
- `/api/unknown`: 404 JSON error.
- Legacy `/health` and `/ready` remain available.

## Railway
Set `DATABASE_URL` to an internal database URL only for a Railway-hosted API on the same private network; use the external TCP proxy URL for local macOS development. Do not log or share secrets. The tests mock DB readiness and do not connect to MySQL or change any records.

## Validation gate
Proceed to 2B.2 only after typechecking, 11 tests, real health and readiness requests, and `npm audit` pass.

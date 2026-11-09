# Receipt Price Tracker — iPhone and Android

**Status:** Phase 2A database foundation. This is not yet a functioning mobile app.

## Requirements

- Node.js 22+ and npm 10+
- A **new and empty** MySQL 8 database (local or Railway)
- A separate, non-production database for the first migration test

## Install & check

1. Copy `.env.example` to `.env`, and set `DATABASE_URL` to the **new project database**.
2. `npm install`
3. `npm run check:source` (reads prototype path, if available, otherwise reports missing)
4. `npm run db:migrate` (only against an empty development database)
5. `npm run db:check`
6. `npm run api:dev` then open `http://localhost:5001/health` and `/ready`.

The migration runner uses a MySQL advisory lock and records migration checksums in `schema_migrations`.
**Important:** MySQL DDL is not transactionally rollback-safe. If a first-run migration fails partway, do not blindly rerun it: investigate the error and restore the empty test database before retrying.
Never run this against an existing business database or production database without testing backups and restores.

## Phase 2A contents

- `packages/database/migrations/0001_initial.sql`: 18 core application tables
- `packages/database/src/schema.ts`: TypeScript Drizzle models for those tables
- `packages/database/src/client.ts`: pooled MySQL/Drizzle connection
- `packages/database/scripts/migrate.ts`: controlled SQL migration runner
- `packages/database/scripts/check.ts`: table existence check
- `services/api/src/server.ts`: a minimal API bootstrap with `/health` and `/ready`
- `scripts/legacy-import/audit_prototype.py`: source dataset inspection; no import or database write

Versioned SQL migrations are currently the authoritative DDL; do not run `drizzle-kit push` to modify the database. Additional migrations must be reviewed as SQL and corresponding Drizzle models updated together.

## Not included yet

No authentication, receipt upload, OCR, full CRUD APIs, React Native app, production deployment, or historical data import has been implemented. The project is not ready for public exposure. Keep the API private until authorization and validation middleware are implemented.

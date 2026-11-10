Receipt Price Tracker Phase 2B.4 gas API patch

Extract from the project root using:
  unzip -o ~/Downloads/receipt-tracker-phase-2b4-gas-patch.zip -d .

Files modified: services/api/src/app.ts, services/api/src/server.ts
Files added: services/api/src/gas/*, services/api/tests/gas*.test.ts, docs/PHASE_2B4.md, scripts/seed-fuel-grades.sql

No migrations or database changes are executed by installing this patch.
The existing database/schema and grocery routes are preserved.

Before install: commit or back up your working repository.
After install: npm install; npm run typecheck --workspace @receipt-tracker/api; npm run test --workspace @receipt-tracker/api; npm run db:check; npm audit.

Tests were authored but not run in this environment because npm installation timed out; you must run them locally before considering the patch validated.

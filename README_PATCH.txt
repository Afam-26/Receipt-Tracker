Receipt Price Tracker — Phase 2B.5 Advanced Analytics

Install in your existing project root using unzip -o. This patch modifies
services/api/src/app.ts and services/api/src/server.ts and adds the analytics
module, two test files, and docs/PHASE_2B5.md.

No database changes, package.json changes, or .env changes.

On your Mac run:
  npm run typecheck --workspace @receipt-tracker/api
  npm run test --workspace @receipt-tracker/api
  npm run db:check
  npm audit

Read docs/PHASE_2B5.md for endpoints and data limitations.

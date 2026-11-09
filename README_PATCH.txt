Receipt Price Tracker — Phase 2B.2 patch
Unzip this archive at the receipt-price-tracker repository root.
Additive auth changes are limited to services/api plus docs/PHASE_2B2.md.
The existing schema, migrations, root package.json, .env, and Phase 2B.1 tests are not overwritten.
Run npm install, npm run typecheck --workspace @receipt-tracker/api, npm run test --workspace @receipt-tracker/api.
Set CLERK_SECRET_KEY and preferably CLERK_ISSUER in the uncommitted root .env before starting the API.

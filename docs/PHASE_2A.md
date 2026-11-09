# Phase 2A decisions and acceptance checks

## Scope

- iPhone + Android via a future Expo app
- Node.js backend on Railway, MySQL 8, private object storage later
- One account owner for every receipt, transaction, and derived record
- SQL migrations tracked in `schema_migrations`; Drizzle schema mirrors columns
- Keep uncertain OCR fields `NULL`; no fabricated prices or package sizes
- Preserve original receipt hash and storage reference; `source_filename` does not prove presence of file
- Do not automatically merge identical-looking grocery lines; row position distinguishes repeated purchases
- Keep gas paid price, regular pre-reward price, discount and derivation source separate
- Fuel grade must be verified before inclusion in grade-specific price history

## Acceptance criteria

1. `0001_initial.sql` contains exactly 18 business tables and composes without missing relationship targets.
2. All account-scoped child records use (user_id, parent_id) foreign keys where applicable.
3. All monetary columns are decimals; gallon values and per-gallon prices are four-decimal quantities.
4. Manual and legacy records may have a null receipt or unknown original image.
5. Identical source records can be preserved as separate line items; file hashes are not used to deduplicate line items.
6. Running the migration twice must skip previously applied SQL after verifying unchanged checksums.
7. `db:check` confirms the 18 application tables on a test database.
8. `/health` returns a server status; `/ready` tests DB connectivity.

## Known deferrals and design boundaries

- A merchant-specific mapping table for fuel grades may be added in a future migration after OCR testing.
- Refund-linked events may require explicit refund references beyond line-item adjustment rows; do not treat the status field as sufficient financial accounting.
- An account-specific semantic-duplicate validation algorithm must be implemented before upload endpoints go live.
- The current `fuel_grades` unique index includes nullable octane; enforce grade identity additionally in application services until stronger catalog constraints are added.
- `user_settings` defaults are database defaults; the app must still validate allowed ranges.
- MySQL's DDL auto-commit behavior requires restore-based recovery for partially failed migrations.
- No production DB was connected; migration and TypeScript compilation must be verified in a network-enabled development environment.

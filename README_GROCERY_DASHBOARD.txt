GROCERY DASHBOARD - UI AND READ-ONLY API

1. cd /Volumes/Lexar/StoxCloudDev/receipt-price-tracker
2. unzip -o ~/Downloads/receipt-tracker-grocery-dashboard-v1.zip -d .
3. python3 scripts/install-grocery-dashboard.py
4. export TMPDIR=/Volumes/Lexar/DevCaches/tmp/
5. npm run typecheck --workspace @receipt-tracker/api
6. npm run typecheck --workspace @receipt-tracker/mobile
7. npm run test --workspace @receipt-tracker/api
8. Restart npm run api:dev, reload Expo with r.

The new /api/grocery/dashboard endpoint requires Clerk, scopes rows to authenticated user, only includes confirmed grocery transactions and lines, and never writes to the database.

The Grocery tab provides category/product and date filters; summary cards; price increase rankings with thresholds and sorting; a product price trend; and refresh. Layout follows user's supplied desktop screenshots but is mobile-friendly. It shows real database data; it will appear sparse until the user has multiple confirmed purchases. The 5,000 observation cap is disclosed in UI.

This patch does NOT implement CSV export; mobile sharing/download controls need separate design.
No new database migration, no OCR change, no native rebuild. No existing test data is modified.

This patch was authored against code from the prior project packages and the current app.ts/server.ts text supplied in chat. Run TypeScript checks on your Mac before use.

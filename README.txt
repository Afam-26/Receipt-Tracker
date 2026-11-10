Receipt Price Tracker — Phase 2B.5 LIVE analytics verification

READ ONLY for your Receipt Price Tracker API and database. The script creates
short-lived test sessions via the Clerk development API but makes GET-only
calls to the local Express API. Nothing is updated or deleted from MySQL.

Requirements:
- Prior Phase 2B.4 live test created User A review-only grocery/gas purchases.
- Two DIFFERENT Clerk development user IDs, with User A owning the test rows.
- Clerk development secret in the project-root .env (CLERK_SECRET_KEY=sk_test_...).
- Existing local API running on http://localhost:5001.
- Phase 2B.5 analytics patch installed and TypeScript/tests passing.

INSTALL
1. Copy live-analytics-validation.mjs into your receipt-price-tracker root.
2. In a Mac terminal from that root:
   export CLERK_TEST_USER_A_ID="user_YOUR_EXISTING_TEST_USER_A_ID"
   export CLERK_TEST_USER_B_ID="user_YOUR_EXISTING_TEST_USER_B_ID"
3. In another terminal: npm run api:dev
4. Run: node live-analytics-validation.mjs

Expected: 'SUCCESS — Phase 2B.5 live analytics, review exclusion, and
cross-account read isolation passed.'

Do not paste Clerk secret or JWT values into chats. Share only status lines.
Do not commit the script if you do not want test-only utilities in the repo.

What this verifies:
- Both real Clerk session tokens; two different local users
- User A owned product analytics, trend observations, merchant summaries
- Review-only grocery transaction excluded from confirmed trends
- User B receives 404 when requesting User A's product analytics
- Gas dashboard section order and review-only exclusion from chart
- User B gas dashboard excludes User A review-only gas purchase
- Both dashboards agree with standalone settings/history/ranks/impact/lists

Important: If there are many purchases and your existing test entries exceed
20 pages of 100 items, the script will stop safely instead of claiming success.
This is a read-only smoke/integration test, not a full production security audit.

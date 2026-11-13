# Grocery dashboard v2 — iPhone/Android UI

## Scope
This patch replaces **only** the Grocery mobile screen with a more compact and responsive dashboard. It retains the working Clerk-protected endpoint `/api/grocery/dashboard`, and does not change its SQL queries, response data, database schema, existing product records, or confirmation logic.

- Compact category and product dropdowns via React Native Modal; full product names shown in the selection list.
- Calendar date selection with optional strict YYYY-MM-DD entry. Selecting a date applies it to the confirmed-purchase dashboard filter.
- Summary cards for recorded confirmed lines, minimum, maximum and average unit prices.
- Price increase ranking: percentage threshold, sort by percentage/dollars, exact product variant and package, first/latest dates and prices.
- Variant-specific price trend plot and dated price observations; avoids mixing different package sizes.
- Share ranking and purchase-history CSV-formatted **text** using the native iPhone/Android share sheet. Choose a compatible receiving app to save with a `.csv` extension. This feature does **not** create a CSV file in Files/Downloads on its own; that would need an additional native filesystem/share integration.
- Display a warning if the existing dashboard API truncates the 5,000-line result. Exports and aggregates cover only returned records in that case.
- Title wraps with reserved room for the existing Settings button to avoid collision.
- Empty states when confirmed price data is insufficient. No fabricated samples.

## Install
From repo root:

```sh
unzip -o ~/Downloads/receipt-tracker-grocery-dashboard-v2.zip -d .
python3 scripts/install-grocery-dashboard-v2.py
export TMPDIR=/Volumes/Lexar/DevCaches/tmp/
npm run typecheck --workspace @receipt-tracker/mobile
npm run typecheck --workspace @receipt-tracker/api
npm run test --workspace @receipt-tracker/api
```

Reload JS by pressing `r` in the running Expo terminal. No native package or migration is introduced.

## Validation
1. Open Grocery. It should load the current test product and show the same confirmed price summary as v1 (one recorded purchase at $4.29 in the existing test dataset).
2. Open category and product dropdowns. Select the test product.
3. Select a date range that includes your test purchase and verify summary stays consistent.
4. Check price trend (single point is expected for one confirmed observation).
5. Check ranking stays empty until **two confirmed, comparable** purchases exist.
6. Tap both Share CSV controls; check the share sheet opens. Sharing text is not equivalent to a downloaded `.csv` file.
7. Confirm Receipts, Gas and Utilities tabs still work.

## Restore
The guarded installer writes a dated backup under `scripts/backups/grocery.before-v2.*.tsx`. If a problem occurs, restore that file to `apps/mobile/src/app/(tabs)/grocery.tsx` and reload Expo.

## Limitations
- Existing backend returns a maximum of 5,000 confirmed observations and first 100 catalog products; v2 does not remove those limits.
- Graph is a simple native Views line chart without new dependencies; most recent 80 points are graphed for performance.
- No new backend endpoints, database migrations, or source receipt handling changes.

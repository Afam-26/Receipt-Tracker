GROCERY DASHBOARD ROUTE FIX — for the installed Phase 4C ZIP

Cause: Phase 4C unzip overwrote mobile Grocery screen, but original installer aborted before adding backend endpoint because the project now includes Utility routes. The app then displays "Route not found".

Install:
 cd /Volumes/Lexar/StoxCloudDev/receipt-price-tracker
 unzip -o ~/Downloads/receipt-tracker-grocery-dashboard-route-fix.zip -d .
 python3 scripts/fix-grocery-dashboard-registration.py
 export TMPDIR=/Volumes/Lexar/DevCaches/tmp/
 npm run typecheck --workspace @receipt-tracker/api
 npm run typecheck --workspace @receipt-tracker/mobile
 npm run test --workspace @receipt-tracker/api

Restart the running API process (CTRL+C then npm run api:dev). Reload Expo with r. Verify unauthenticated route returns HTTP 401, not 404:
 curl -i http://127.0.0.1:5001/api/grocery/dashboard

No migration and no database writes. Installer saves timestamped backups of app.ts and server.ts before changing them, preserves existing Utility routes, and aborts on unexpected source signatures. If authenticated dashboard shows a SQL error rather than data, report the API terminal output before editing SQL.

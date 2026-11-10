Phase 3C confirmation test script correction

Fixes /api/me response parsing. /api/me returns {ok:true,user:{id,email}} rather than {ok:true,data:{...}}. All other endpoint parsing remains unchanged.

Install:
  cd /Volumes/Lexar/StoxCloudDev/receipt-price-tracker
  unzip -o ~/Downloads/receipt-tracker-phase3c-confirm-fix.zip -d .

Only then retry PREPARE:
  node review-confirm-current-db.mjs prepare /tmp/test-receipt.png

Do NOT run confirm until PREPARED and manifest exists.

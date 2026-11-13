Phase 4B iOS camera + photo library permission fix

Install from the Receipt Price Tracker repository root:
  unzip -o ~/Downloads/receipt-tracker-phase4b-ios-permissions-fix.zip -d .
  bash scripts/fix-ios-permissions-phase4b.sh

The script edits only apps/mobile/app.json and runs a non-clean Expo iOS prebuild to update generated native configuration. It verifies that NSCameraUsageDescription and NSPhotoLibraryUsageDescription exist in apps/mobile/ios/ReceiptPriceTracker/Info.plist. It does not alter backend, database, Clerk, RevenueCat, or source receipt workflows.

Build again to install the changed Info.plist:
  cd apps/mobile
  npx expo run:ios --device "iPhone 17"

For simulator testing, use Select from Photos with a sample receipt image: the simulator camera may not provide realistic camera capture. Camera capture should be tested on a physical device later.

Do not use expo start alone for this change: the Info.plist is compiled into the native app.

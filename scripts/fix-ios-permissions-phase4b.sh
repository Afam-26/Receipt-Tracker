#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$REPO_ROOT/apps/mobile"
CONFIG="$MOBILE/app.json"
if [[ ! -f "$CONFIG" ]]; then echo "Missing $CONFIG" >&2; exit 1; fi
if [[ ! -f "$MOBILE/ios/ReceiptPriceTracker/Info.plist" ]]; then echo "Missing generated iOS project. Build it once with npx expo run:ios." >&2; exit 1; fi
node - "$CONFIG" <<'NODE'
const fs=require('node:fs');
const file=process.argv[2];
const config=JSON.parse(fs.readFileSync(file,'utf8'));
if (!config.expo) throw new Error('Expected expo configuration in app.json');
const expo=config.expo;
expo.ios??={};
expo.ios.infoPlist??={};
expo.ios.infoPlist.NSCameraUsageDescription='Receipt Price Tracker needs camera access to photograph receipts you choose to upload.';
expo.ios.infoPlist.NSPhotoLibraryUsageDescription='Receipt Price Tracker needs photo library access to select receipt images you choose to upload.';
expo.plugins??=[];
const picker=['expo-image-picker',{photosPermission:expo.ios.infoPlist.NSPhotoLibraryUsageDescription,cameraPermission:expo.ios.infoPlist.NSCameraUsageDescription,microphonePermission:false}];
let found=false;
expo.plugins=expo.plugins.map(p=>{
  if (p==='expo-image-picker'||(Array.isArray(p)&&p[0]==='expo-image-picker')) {found=true;return picker;}
  return p;
});
if (!found) expo.plugins.push(picker);
fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n');
console.log('Updated app.json camera and photo-library usage descriptions and image-picker plugin.');
NODE
cd "$MOBILE"
# Do not use --clean: it would recreate the native project and potentially discard local native changes.
npx expo prebuild --platform ios --no-install
PLIST="$MOBILE/ios/ReceiptPriceTracker/Info.plist"
for KEY in NSCameraUsageDescription NSPhotoLibraryUsageDescription; do
  if ! /usr/libexec/PlistBuddy -c "Print :$KEY" "$PLIST" >/dev/null 2>&1; then
    echo "Error: $KEY not present in generated Info.plist" >&2
    exit 1
  fi
done
echo 'PASS: Both iOS permission descriptions are present in the native Info.plist.'
echo 'Now run: cd apps/mobile && npx expo run:ios --device "iPhone 17"'

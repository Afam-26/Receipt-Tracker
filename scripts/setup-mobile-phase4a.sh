#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
MOBILE="$PWD/apps/mobile"
if [ -f "$MOBILE/package.json" ]; then
  echo 'apps/mobile/package.json already exists. Refusing to re-scaffold.' >&2
  exit 1
fi
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
printf 'Scaffolding Expo baseline using the latest official default template...\n'
npx --yes create-expo-app@latest "$TEMP/receipt-mobile-seed" --template default --no-install
# Copy only template dependency manifests. Never replace our screens or any backend code.
cp "$TEMP/receipt-mobile-seed/package.json" "$MOBILE/package.json"
cp "$TEMP/receipt-mobile-seed/tsconfig.json" "$MOBILE/tsconfig.json"
node --input-type=module <<'NODE'
import fs from 'node:fs';
const file='apps/mobile/package.json';const pkg=JSON.parse(fs.readFileSync(file,'utf8'));
pkg.name='@receipt-tracker/mobile';pkg.private=true;pkg.main='expo-router/entry';
pkg.scripts={start:'expo start',ios:'expo run:ios',android:'expo run:android',typecheck:'tsc --noEmit',...Object.fromEntries(Object.entries(pkg.scripts??{}).filter(([k])=>!['start','ios','android','typecheck'].includes(k)))};
fs.writeFileSync(file,JSON.stringify(pkg,null,2)+'\n');
NODE
npm install
cd "$MOBILE"
npx expo install @clerk/expo expo-secure-store expo-auth-session expo-crypto expo-web-browser expo-dev-client react-native-purchases
printf '\nMobile packages installed. Configure apps/mobile/.env from .env.example.\n'

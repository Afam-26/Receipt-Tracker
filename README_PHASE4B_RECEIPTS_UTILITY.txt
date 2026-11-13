Receipt Price Tracker — Receipts utility selection UI patch

WHAT IT DOES
- Adds Utility alongside Grocery, Gas and Detect later in New receipt.
- Uses card-style choice controls with accessible selected-state.
- When Utility is selected, shows household utility categories and a direct Utilities-tab navigation.
- Deliberately does NOT upload utility bills as "unknown" or "grocery". The existing API only understands grocery/gas/unknown; utility bill persistence and review require their own migration and API.
- Existing grocery/gas receipt upload, OCR, review and confirmation are unchanged.
- No new packages, native build, .env or database changes.

INSTALL
cd /Volumes/Lexar/StoxCloudDev/receipt-price-tracker
unzip -o ~/Downloads/receipt-tracker-phase4b-receipts-utility-choice.zip -d .
npm run typecheck --workspace @receipt-tracker/mobile
cd apps/mobile
npx expo start --clear

VALIDATE
1. Receipts: Grocery, Gas, Utility and Detect later appear as selectable cards.
2. Utility: explains upcoming functionality; Open Utilities dashboard navigates to Utilities.
3. Grocery/Gas: camera and library buttons remain available and upload through same authenticated API.
4. Recent receipts remain listed, can be opened and their review drafts persist.
5. No utility bill is persisted until the separate backend model is added.

DESIGN REFERENCE
The provided ChatGPT conversation link could not be read from this execution context. This patch matches the current mobile app's existing visual palette and card layout, but does not claim pixel-perfect correspondence to that linked design. A screenshot/export of the reference would allow a faithful redesign.

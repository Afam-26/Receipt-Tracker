RECEIPT PRICE TRACKER — UTILITIES API + MOBILE TRACKER

This is an ADDITIVE CODE PATCH, not an applied deployment.

1. Keep a fresh Railway DB backup. Do not automatically run SQL migrations on the existing prelaunch DB.
2. From project root unzip receipt-tracker-utilities-backend-mobile.zip.
3. Read docs/UTILITY_INTEGRATION.md FIRST. Inspect migration version and local users.id schema.
4. Integrate createUtilityRouter under VERIFIED Clerk authentication and local user ownership resolver. No req.userId trust.
5. Run TypeScript/tests, migrate after backup and review, then test GET /api/utilities/bills and mobile Utilities tab.
6. No native rebuild expected if expo-crypto is already installed; otherwise `cd apps/mobile && npx expo install expo-crypto` followed by rebuild.
7. Utility bill photo storage and utility-specific OCR are NOT included. Mobile supports manual bills and explicit confirmation.

This patch doesn't alter existing grocery/gas/receipt/OCR/RevenueCat/Clerk files.

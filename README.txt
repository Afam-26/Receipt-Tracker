Receipt Price Tracker live integration test

Extract live-integration.mjs to your receipt-price-tracker project root.
Set CLERK_TEST_USER_A_ID and CLERK_TEST_USER_B_ID in your shell.
Ensure the API is running, then run: node live-integration.mjs
Uses your root .env. Do not share secret keys or tokens.
The script creates development test rows; it does not delete them.

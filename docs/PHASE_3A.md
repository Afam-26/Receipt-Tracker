# Receipt Price Tracker — Phase 3A (private Railway Bucket uploads)

## Scope
- Additive API patch; **NO migrations** or changes to the existing 18 MySQL application tables.
- API uses existing Clerk Bearer authentication. **Every** SQL query is scoped to authenticated local user ID.
- Private Railway Bucket objects, never publicly accessible. Railway bucket access keys stay exclusively on the server.
- Binary request body, maximum 10 MiB, JPEG/PNG/WebP/PDF by magic header and Content-Type agreement. iOS HEIC must be converted to JPEG in a future mobile client before upload.
- SHA-256 fingerprint stored on both `receipts.primary_file_hash` and `receipt_files.file_hash`; same-owner uploads with identical bytes are linked using `duplicate_of_id` (not silently merged). Different users do not share receipt IDs or storage keys.
- Upload creates receipt with `processing_status='uploaded'` and **does not** create OCR jobs, confirm purchases, or affect analytics.
- Errors from bucket and MySQL are sanitized. Failure to save MySQL metadata after bucket upload triggers best-effort object cleanup; review bucket objects if cleanup fails.

## Install
1. Commit current validated source (ensure `.env`, `node_modules`, JWTs are excluded).
2. Stop API.
3. Unzip patch at project root: `unzip -o ~/Downloads/receipt-tracker-phase-3a-railway-bucket-patch.zip -d .`
4. `npm install`
5. In Railway -> Receipt Tracker project -> Tracker bucket -> Credentials, retrieve the **S3 bucket name** (`BUCKET`), `ENDPOINT`, `REGION`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, and URL style. Do not use the display name `Tracker bucket` as the S3 bucket name. The bucket is private by default.
6. Enter the values into the root `.env` for local development. These variable names are supported by our adapter:

```dotenv
STORAGE_PROVIDER=railway
STORAGE_BUCKET=THE_BUCKET_VALUE
STORAGE_ENDPOINT=https://YOUR-RAILWAY.storageapi.dev
STORAGE_REGION=auto
STORAGE_ACCESS_KEY_ID=YOUR_KEY_ID
STORAGE_SECRET_ACCESS_KEY=YOUR_SECRET
STORAGE_URL_STYLE=virtual
```

Use `path` for `STORAGE_URL_STYLE` only when Railway's Credentials tab specifies path-style URL. `STORAGE_REGION` must match Railway's actual `REGION` value (often `auto`). The code also supports standard Railway CLI `AWS_ENDPOINT_URL`, `AWS_S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `AWS_S3_URL_STYLE` aliases.
7. For a deployed API running on Railway, use **variable references** in the API service to the bucket credentials, not copied plaintext values. For your initial smoke test, prefer a separate development/staging bucket and database. If you test with the production bucket, the test object is permanently retained unless manually cleaned up.

8. Validate:
```bash
npm run typecheck --workspace @receipt-tracker/api
npm run test --workspace @receipt-tracker/api
npm run db:check
npm audit
npm run api:dev
```

If Railway storage variables are absent, old grocery/gas/analytics endpoints still run, but receipt endpoints are disabled (404). Partial bucket configuration fails startup rather than bypassing storage security.

## Endpoints
- `POST /api/receipts` (binary body; authenticated): headers `Content-Type: image/jpeg|image/png|image/webp|application/pdf`, `X-Receipt-Filename: receipt.jpg`, optional `X-Receipt-Type: grocery|gas|mixed|unknown`. Returns **201** with `{ok:true,data:{receiptId,fileId,duplicateOfId,processingStatus,sha256,mimeType,byteSize}}`. No public storage key or URL returned.
- `GET /api/receipts?limit=25&offset=0`: authenticated list of your receipt metadata and files (maximum 100 per page).
- `GET /api/receipts/:receiptId`: authenticated receipt detail; foreign IDs look like nonexistent IDs (**404**).
- `GET /api/receipts/:receiptId/files/:fileId/download`: authenticated, private streaming download; cross-account file IDs return **404**; `Cache-Control: private,no-store`, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`.

The `POST` request must send **raw file bytes**; it is **not multipart/form-data, JSON, or base64**. Example of a development upload (do not expose JWT in shell history):
```bash
curl --fail-with-body -X POST http://localhost:5001/api/receipts \
  -H "Authorization: Bearer $CLERK_DEV_TOKEN" \
  -H 'Content-Type: image/jpeg' \
  -H 'X-Receipt-Filename: test-receipt.jpg' \
  -H 'X-Receipt-Type: grocery' \
  --data-binary @/absolute/path/to/test-receipt.jpg
```
Use `CLERK_DEV_TOKEN` only in a local shell environment; never paste it into chat or store it in git.

## Optional live smoke test
`CLERK_TEST_USER_A_ID` must be a real user ID from the **Clerk development instance**. With the API running and Railway bucket configured, execute `node scripts/receipt-upload-smoke.mjs` from the project root. This obtains a short-lived token via the development Clerk API without printing it, uploads a minimal PNG, confirms metadata retrieval and byte-for-byte download. **It creates a permanent test receipt in Railway; no cleanup is performed.** The sample is not a real receipt and remains `uploaded` (not confirmed).

## Security / deployment follow-ups
- This phase checks file *signatures*, not full document parsing, malware scanning, or PDF sanitization. Implement deeper scanning or transformation before any public previews / external sharing. Files are always delivered as attachments.
- Backend buffers at most 10 MiB per upload in memory. Add ingress request/connection limits and upload rate-limiting before production; a user can consume memory or storage costs by repeated authenticated requests.
- If the DB commit has an ambiguous outcome (e.g., network loss during commit), manual bucket/SQL reconciliation may be needed. Never delete referenced storage keys blindly.
- Apply bucket object lifecycle policies and retention controls deliberately, not to receipt records still referenced in SQL.
- For dedicated browser image preview, use separate authenticated short-lived URLs or an image transformation proxy later; no public bucket domain is enabled by this patch.
- Use different Railway buckets and credentials for development and production.

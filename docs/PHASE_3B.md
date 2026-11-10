# Phase 3B — Self-hosted Railway OCR

**What this adds:** OCR queue endpoints and a separate worker powered by the open-source Tesseract binary; heuristic grocery/gas classification and tentative field extraction. No Google Document AI subscription is required. Railway compute, bucket and database usage can still incur costs.

**No migration:** Uses `receipts`, `receipt_files`, `receipt_processing_jobs`, `receipt_extractions`, `receipt_review_issues`, and `audit_logs` that already exist in the 18-table schema.

**Read this before installing:** This patch overlays **Phase 3A Railway bucket** (not the older Cloudflare patch). It modifies only `services/api/src/app.ts`, `services/api/src/server.ts`, and `services/api/package.json`; new code lives in `services/api/src/ocr/`. Keep production credentials private. Make a Git commit first, after excluding `.env` and keys.

## Install and validate locally

```bash
cd /Volumes/Lexar/StoxCloudDev/receipt-price-tracker
unzip -o ~/Downloads/receipt-tracker-phase-3b-self-hosted-ocr-patch.zip -d .
npm install
npm run typecheck --workspace @receipt-tracker/api
npm run test --workspace @receipt-tracker/api
npm run db:check
npm audit
```

Expected database verification: 18 application tables. Tests must pass before trying real receipt processing. OCR doesn't run automatically in the web API.

## Worker setup

On Mac with Homebrew:

```bash
brew install tesseract poppler
which tesseract
which pdftoppm
```

Keep one terminal running the authenticated API:

```bash
npm run api:dev
```

Keep a **second** terminal running the OCR worker:

```bash
npm run ocr:worker --workspace @receipt-tracker/api
```

The worker needs the same `DATABASE_URL` and Railway `STORAGE_*` credentials as the API. It does not require `CLERK_SECRET_KEY`; it trusts the already-queued, owner-scoped job and reads private files directly from Railway storage. The Mac worker uses the root `.env` loader, matching the API.

### Railway deployment

Create a **separate Railway worker service** from the same repository and choose `Dockerfile.ocr` as its Dockerfile path. Disable public networking for that service. Configure Railway `DATABASE_URL` (ideally a private internal address) and `STORAGE_PROVIDER=railway`, `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_URL_STYLE`. The Dockerfile installs `tesseract-ocr`, English traineddata and `poppler-utils` for PDFs; the container runs `npm run ocr:worker --workspace @receipt-tracker/api`.

The Docker build context must be the repository root; the root `package-lock.json` must be committed and up to date after npm install. If the current Railway project is production, use a development environment first. Do **not** run extra workers during validation. Running a dedicated worker incurs Railway compute charges, even though Tesseract itself has no per-document OCR subscription.

## API endpoints (valid Clerk Bearer token required)

- `POST /api/receipts/:receiptId/ocr` — enqueue uploaded/failed owner's receipt; returns 202 with jobId. Cannot enqueue confirmed, processing or needs_review receipts; duplicates return 409.
- `GET /api/receipts/:receiptId/ocr` — view status and unverified extracted suggestions. Returns 404 to another user, even with the receipt ID.

Upload must happen first via Phase 3A `POST /api/receipts`. Queueing merely updates receipt status to processing and inserts a job; a separate worker downloads the object, performs OCR, saves `receipt_extractions` and review issues, then marks receipt `needs_review`. No purchase transactions, gas purchases, grocery line items or analytics observations are written by OCR. It cannot confirm prices.

### Development smoke test using existing receipt

Your previous Phase 3A test created receipt ID 1 for the original development user. Check that the receipt exists in the **same database and bucket** first. An existing `needs_review` or confirmed receipt cannot be enqueued again by this phase.

```bash
export CLERK_TEST_USER_A_ID="user_YOUR_EXISTING_DEVELOPMENT_ID"
export OCR_TEST_RECEIPT_ID="1"
node scripts/ocr-smoke.mjs
```

This test does not print tokens, extracted text or emails. It **does change** the existing receipt's processing status, inserts OCR job/extraction/review rows, and accesses its existing private bucket object. To check the result via SQL without exposing receipt contents:

```sql
SELECT id, receipt_type, processing_status FROM receipts WHERE id=1;
SELECT id, status, attempt_count FROM receipt_processing_jobs WHERE receipt_id=1 ORDER BY id DESC LIMIT 3;
SELECT id, provider, provider_version FROM receipt_extractions WHERE receipt_id=1 ORDER BY id DESC LIMIT 3;
```

Don't publish screenshots with receipt images, OCR raw data, database credentials or JWTs.

## Safety and limits

- JPEG/PNG/WebP/PDF from the private bucket only; image signature rechecked; 10 MiB cap. PDF rendering uses Poppler, first 8 pages, 150 dpi.
- OCR runs in subprocesses without shell interpolation, with execution time/output limits. File paths use generated temporary private directories and are deleted in `finally`.
- The parser uses simple rules, **not a reliable receipt-understanding model**. Fields may be omitted, classified as mixed/unknown or guessed incorrectly. All suggestions have low/medium confidence and review warnings; OCR text itself is not persisted.
- Never calculate before-rewards gas price from discounted paid amount or combine different fuel grades. Missing original gas price remains unknown.
- The status endpoint exposes review suggestions only to the receipt owner. Explicit user review and correction (Phase 3C) are required before confirming any purchase.
- If a worker crashes after claiming a job, that job stays `running`; it is intentionally **not automatically retried** to avoid duplicate data. Investigate and reset manually with a reviewed recovery procedure. This is an operational limitation before production.
- Running OCR on a shared production MySQL/Railway bucket is not recommended during development. Use a separate test receipt and development environment.
- Treat PDF/image parsing as an untrusted input surface; keep Tesseract/Poppler and your base image patched and set resource limits on the Railway worker.

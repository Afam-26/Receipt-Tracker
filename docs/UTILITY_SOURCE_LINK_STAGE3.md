# Utility source statement link: Stage 3

This patch adds an optional, immutable `sourceReceiptId` to utility bill creation. A linked receipt must be a utility-classified receipt owned by the Clerk-authenticated local account. It is not sufficient for the caller to supply an ID: the API verifies ownership and classification. A composite foreign key and a unique key enforce ownership and one bill per source statement in MySQL, including under concurrent requests. MySQL unique keys permit multiple unlinked `NULL` values, so manual bills continue to work. Saved bill details contain `sourceReceiptId`; the mobile screen opens the already-authenticated private receipt detail route. No storage keys or public URLs are exposed.

The migration does not change existing bill status or amounts. Keep the existing confirmed test bill #1. The script does not run migrations. It does not auto-create or auto-confirm bills.

## Install

From repository root:

```sh
unzip -o ~/Downloads/receipt-tracker-utility-source-link-stage3.zip -d .
python3 scripts/apply-utility-source-link.py
export TMPDIR=/Volumes/Lexar/DevCaches/tmp/
npm run typecheck --workspace @receipt-tracker/api
npm run typecheck --workspace @receipt-tracker/mobile
npx tsx --test services/api/src/utilities/validation.test.ts services/api/src/utilities/source-link.test.ts
npm run test --workspace @receipt-tracker/api
```

Before applying `0004`, verify a fresh Railway backup and inspect existing source links (read-only SQL):

```sql
SELECT user_id, source_receipt_id, COUNT(*) AS n
FROM utility_bills WHERE source_receipt_id IS NOT NULL
GROUP BY user_id, source_receipt_id HAVING COUNT(*) > 1;

SELECT b.id, b.user_id, b.source_receipt_id
FROM utility_bills b LEFT JOIN receipts r
ON r.user_id=b.user_id AND r.id=b.source_receipt_id
WHERE b.source_receipt_id IS NOT NULL AND r.id IS NULL;
```

Both queries should return zero rows. The new source link is optional, and existing test bill #1 is expected to remain unlinked. Do not apply migration until the code checks pass and these database constraints are clear.

If clear: `npm run db:migrate` and `npm run db:check`. Then restart the API (not just Expo JS). Test first with a newly uploaded sample utility statement. OCR suggestions must be reviewed and corrected before saving. Reopening that saved bill should show **View original private statement**. Verify duplicate source attempt returns `409` and another user cannot link the same receipt (`404`). Avoid using genuine account identifiers in test screenshots.

**Caveat:** This is source-document linkage, not AI interpretation; it does not establish whether a statement was paid. The app's existing confirmation language refers to accepting a bill into expense history, not evidence of payment. This patch does not add an editing UI for saved drafts.

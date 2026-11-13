# Grocery product editing and category suggestions (Phase 4C.4)

This is an additive, guarded patch against Grocery Dashboard V2 with Category Manager installed. No database migration.

## Features

- Rename a user-owned catalog product in the Category Manager. This changes the catalog display name, not historical amount/date/variant IDs. Authentication and ownership use the existing Clerk middleware. A missing or cross-account product ID returns 404.
- Suggest a matching category based on whole words in the product name and the user's existing category list. Suggestions are **not** written automatically. The user must tap **Use suggested category** and then **Save product category**.
- If names are ambiguous, or the user's account doesn't have the category, no suggestion is displayed. This is a deterministic heuristic, **not OCR or AI classification**.

## Installation

From repo root, extract archive then run `python3 scripts/install-grocery-product-improvements.py`.

## Validation

```bash
export TMPDIR=/Volumes/Lexar/DevCaches/tmp/
npm run typecheck --workspace @receipt-tracker/api
npm run typecheck --workspace @receipt-tracker/mobile
npx tsx --test tests/grocery-category-suggest.test.ts
npm run test --workspace @receipt-tracker/api
```

Restart `npm run api:dev` for the new route, reload Expo with `r`.

## Testing

Use the fictional Phase 3C product. Change its name to `Large Eggs`, save, and verify the label updates while the previously recorded $4.29 remains. If `Eggs` is an existing category, accept the suggestion and **save product category**. Reopen the manager and confirm the assignment persists. Do not rename real products without checking whether linked receipts refer to the same product.

## Safety / limitations

Do not send a source receipt or product data to an external AI service. This release does not modify product variants, package quantity, or receipt extraction; those require separate validated endpoints. User-facing product rename is explicit, and category suggestions do not change database content unless accepted and saved. Source backups are under scripts/backups, outside the Expo source tree.

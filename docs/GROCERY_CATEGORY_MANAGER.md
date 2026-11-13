# Grocery category management (Phase 4C.3)

The category manager is an explicit action in Grocery, separate from the dashboard's read-only price statistics.

* Create a custom category through `POST /api/grocery/categories` (existing authenticated endpoint).
* Choose a product and assign one of your existing account-owned categories through `PATCH /api/grocery/products/:productId/category`.
* Choose Uncategorized to clear a product category.
* Both the product ID and category ID are resolved under the authenticated Clerk-linked local user. A foreign user's ID is not accepted.
* The operation edits `products.category_id` only; it does not rewrite historical line prices or confirmed transactions. It can change how existing purchases are grouped under category filters because they join to the current product category.
* Starter categories from the previous patch are optional. If you want the original HTML's starter category list, install and run its one-time provisioning action first, then manage products here.
* This patch does not automatically classify product names or receipt OCR, and does not create products or seed purchases.

## Installation

From repository root:

```sh
unzip -o ~/Downloads/receipt-tracker-grocery-category-manager.zip -d .
python3 scripts/install-grocery-category-manager.py
export TMPDIR=/Volumes/Lexar/DevCaches/tmp/
npm run typecheck --workspace @receipt-tracker/api
npm run typecheck --workspace @receipt-tracker/mobile
npm run test --workspace @receipt-tracker/api
```

Restart API (`npm run api:dev`) after the checks, then reload Expo (`r`).

## Testing

1. Grocery > Manage product categories.
2. Create `Eggs` if you do not have it already.
3. Choose your existing Phase 3C test product and assign `Eggs`. Changes to this **existing test product** are only for UI validation.
4. Close and refresh. Filter Product category > Eggs. The product should appear in the specific product dropdown.
5. Confirm the summary still uses the same confirmed purchase record/price; no new transaction is created.
6. Try a wrong product/category ID only in an isolated API test, never by guessing another real user's IDs; expect 404 for missing foreign references.

## Cautions

This installer matches the Grocery V2 source. If it aborts, do not bypass its checks; send the output for adjustment. It doesn't run migrations or touch Railway itself. It backs up all three modified source files under scripts/backups.

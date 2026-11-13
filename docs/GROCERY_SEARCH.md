# Grocery searchable categories and products

This mobile-only patch adds a case-insensitive, substring search input in each Grocery selector dialog (including product category, specific product, ranking thresholds, sorting and variant/package selections) and separately within the **Manage product categories** dialog for products and category assignment.

Search filters only options already loaded for the signed-in user. It does not query or modify Railway. Selecting an option preserves the existing filter/assignment logic. Typing alone never saves changes.

## Install

From repository root:

```sh
unzip -o ~/Downloads/receipt-tracker-grocery-search.zip -d .
python3 scripts/install-grocery-search.py
npm run typecheck --workspace @receipt-tracker/mobile
```

Reload Expo with `r` in the existing Metro terminal. No Xcode build or migration.

## Test

- Grocery > Product category > type `egg`: Eggs appears (assuming it is in your own catalog). Clear the search to see all.
- Grocery > Specific product > type part of a product name, then select it.
- Grocery > Manage product categories > search product name. Choose product; search categories with `egg`, choose Eggs, then tap Save product category to persist.
- Reopen and verify the assignment. Category lists contain user-owned categories only; 52 starter categories must have been installed previously.

## Safety

The installer requires exact expected version markers, aborts before writing if the installed file differs, and saves backups outside Expo's `src` folder. It is idempotent. Only the Grocery screen changes. The existing backend and confirmation code are untouched.

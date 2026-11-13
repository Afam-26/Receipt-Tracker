# Grocery categories from original tracker

This patch fixes the empty category selection in Grocery Dashboard V2. Your original HTML contains 52 category labels from its **starter dataset**, whereas the new Railway-backed account currently has no category records. This patch does **not** copy the 135 sample purchases into Railway.

It adds an authenticated `POST /api/grocery/categories/starter` endpoint, using the existing Clerk ownership middleware and GroceryStore methods. The endpoint creates missing categories for **the signed-in account only**, and is intended to be idempotent for sequential calls. The Grocery dashboard shows an **Add 52 starter grocery categories** button when the authenticated account has none. Tap it once and the selector updates. Any existing category is left intact. No products, variants, purchases, or prices are created or changed.

**Note:** Existing products with no `category_id` stay uncategorized. A category will have no products until items are assigned to it. Category management and assigning products to categories are follow-up features. For large catalogs, pagination beyond the first 100 categories will need enhancement.

Run `python3 scripts/install-grocery-starter-categories.py`; then TypeScript checks and API tests; restart Express API (not just Expo); reload mobile. The endpoint is POST, so a curl GET returning 404 is normal. A POST without Clerk authorization should return HTTP 401.

If you want to undo source changes, restore the `.before-starter-categories.bak` files beside the two edited source files. The backend is not changing the database until the setup button is pressed.

import type { Express, RequestHandler } from 'express';
import type { AuthServices } from '../auth/types.js';
import { createRequireUser, type AuthRequest } from '../auth/routes.js';
import { HttpError } from '../http/errors.js';
import type { GroceryStore } from './store.js';
import { id, parseCategory, parseList, parseProduct, parsePurchase, parseVariant } from './validation.js';

export function registerGroceryRoutes(app: Express, auth: AuthServices, grocery: GroceryStore): void {
  const requireUser = createRequireUser(auth);
  const owner: RequestHandler = (req, _res, next) => {
    if (!(req as AuthRequest).authenticatedUser?.id) return next(new HttpError(401, 'AUTH_REQUIRED', 'Authentication required'));
    next();
  };
  const userId = (req: AuthRequest) => req.authenticatedUser!.id;
  const wrap = (fn: (req: AuthRequest) => Promise<unknown>, status = 200): RequestHandler =>
    async (req, res) => { const value = await fn(req as AuthRequest); res.status(status).json({ ok: true, data: value }); };
  const guards = [requireUser, owner];

  // STARTER_CATEGORIES_SETUP: explicit, authenticated and owner-scoped; never seeds purchases.
  app.post('/api/grocery/categories/starter', ...guards, wrap(async req => {
    const ownerId = userId(req);
    const existing = await grocery.listCategories(ownerId, parseList({ limit: 100, offset: 0 })) as Array<{ name: string }>;
    const seen = new Set(existing.map(c => c.name.trim().toLocaleLowerCase('en-US')));
    const starter = ["Apples", "Avocados", "Bacon", "Bakery", "Bananas", "Beer", "Blueberries", "Bread", "Carrots", "Celery", "Cereal", "Cheese", "Chicken", "Citrus", "Coffee", "Cups", "Dairy", "Eggs", "Frozen foods", "Garlic", "Ginger", "Grapes", "Household", "Juice", "Kiwi", "Lemons", "Mandarins", "Mangoes", "Meat", "Milk", "Nuts", "Oil", "Onions", "Pantry", "Peanut butter", "Peppers", "Personal care", "Pineapple", "Pizza", "Raspberries", "Sauces", "Seafood", "Snacks", "Spices", "Spinach", "Strawberries", "Tomatoes", "Vegetables", "Vitamins", "Watermelon", "Wine", "Yogurt"];
    let created = 0;
    for (const name of starter) {
      const key = name.toLocaleLowerCase('en-US');
      if (seen.has(key)) continue;
      await grocery.createCategory(ownerId, parseCategory({ name }));
      seen.add(key); created++;
    }
    return { created, totalStarter: starter.length };
  }));
  app.get('/api/grocery/categories', ...guards, wrap(req => grocery.listCategories(userId(req), parseList(req.query))));
  app.post('/api/grocery/categories', ...guards, wrap(req => grocery.createCategory(userId(req), parseCategory(req.body)), 201));
  app.get('/api/grocery/products', ...guards, wrap(req => grocery.listProducts(userId(req), parseList(req.query))));
  app.post('/api/grocery/products', ...guards, wrap(req => grocery.createProduct(userId(req), parseProduct(req.body)), 201));
  // GROCERY_CATEGORY_MANAGER_V1: update only an owned product using an owned category.
  app.patch('/api/grocery/products/:productId/category', ...guards, wrap(req => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'categoryId')) {
      throw new HttpError(400, 'INVALID_CATEGORY_ASSIGNMENT', 'Only categoryId may be changed');
    }
    return grocery.assignProductCategory(userId(req), id(req.params.productId, 'productId')!, id(body.categoryId, 'categoryId', false));
  }));
  // GROCERY_PRODUCT_IMPROVEMENTS_V1: no direct editing of historical purchases.
  app.patch('/api/grocery/products/:productId/name', ...guards, wrap(req => {
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, 'canonicalName')) {
      throw new HttpError(400, 'INVALID_PRODUCT_NAME', 'Only canonicalName may be updated');
    }
    const name = (body as { canonicalName: unknown }).canonicalName;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 191 || /[\x00-\x1f\x7f]/.test(name)) {
      throw new HttpError(400, 'INVALID_PRODUCT_NAME', 'Product name must be 1–191 printable characters');
    }
    return grocery.renameProduct(userId(req), id(req.params.productId, 'productId')!, name.trim());
  }));
  app.get('/api/grocery/variants', ...guards, wrap(req => grocery.listVariants(userId(req), parseList(req.query))));
  app.post('/api/grocery/variants', ...guards, wrap(req => grocery.createVariant(userId(req), parseVariant(req.body)), 201));
  app.get('/api/grocery/purchases', ...guards, wrap(req => grocery.listPurchases(userId(req), parseList(req.query))));
  app.post('/api/grocery/purchases', ...guards, wrap(req => grocery.createPurchase(userId(req), parsePurchase(req.body)), 201));
  app.get('/api/grocery/purchases/:purchaseId', ...guards, wrap(async req => {
    const purchase = await grocery.getPurchase(userId(req), id(req.params.purchaseId, 'purchaseId')!);
    if (!purchase) throw new HttpError(404, 'PURCHASE_NOT_FOUND', 'Purchase not found');
    return purchase;
  }));
  app.get('/api/grocery/variants/:variantId/history', ...guards, wrap(async req => {
    const history = await grocery.history(userId(req), id(req.params.variantId, 'variantId')!, parseList(req.query));
    if (!history) throw new HttpError(404, 'VARIANT_NOT_FOUND', 'Variant not found');
    return history;
  }));
}

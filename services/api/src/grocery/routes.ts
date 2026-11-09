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

  app.get('/api/grocery/categories', ...guards, wrap(req => grocery.listCategories(userId(req), parseList(req.query))));
  app.post('/api/grocery/categories', ...guards, wrap(req => grocery.createCategory(userId(req), parseCategory(req.body)), 201));
  app.get('/api/grocery/products', ...guards, wrap(req => grocery.listProducts(userId(req), parseList(req.query))));
  app.post('/api/grocery/products', ...guards, wrap(req => grocery.createProduct(userId(req), parseProduct(req.body)), 201));
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

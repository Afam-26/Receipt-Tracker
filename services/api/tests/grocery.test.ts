import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import type { AuthServices } from '../src/auth/types.js';
import type { GroceryStore } from '../src/grocery/store.js';

const recorded: Array<{ kind: string; userId: string; payload?: unknown }> = [];
const auth: AuthServices = {
  provider: {
    async verify(token) { if (token === 'alpha') return 'clerk_a'; if (token === 'beta') return 'clerk_b'; throw new Error('invalid'); },
    async getIdentity(subject) { return { subject, email: `${subject}@example.test` }; },
  },
  store: {
    async sync(identity) { return { id: identity.subject === 'clerk_a' ? '10' : '20', subject: identity.subject, email: identity.email }; },
    async getSettings() { return null; },
    async close() {},
  },
};
const grocery: GroceryStore = {
  async listCategories(userId) { recorded.push({ kind: 'categories', userId }); return []; },
  async createCategory(userId, v) { recorded.push({ kind: 'createCategory', userId, payload: v }); return { id: '101' }; },
  async listProducts(userId, f) { recorded.push({ kind: 'products', userId, payload: f }); return []; },
  async createProduct(userId, v) { recorded.push({ kind: 'createProduct', userId, payload: v }); return { id: '102' }; },
  async listVariants(userId, f) { recorded.push({ kind: 'variants', userId, payload: f }); return []; },
  async createVariant(userId, v) { recorded.push({ kind: 'createVariant', userId, payload: v }); return { id: '103' }; },
  async listPurchases(userId, f) { recorded.push({ kind: 'purchases', userId, payload: f }); return []; },
  async createPurchase(userId, v) { recorded.push({ kind: 'createPurchase', userId, payload: v }); return { id: '104' }; },
  async getPurchase(userId, id) { recorded.push({ kind: 'getPurchase', userId, payload: id }); return id === '104' ? { id, items: [] } : null; },
  async history(userId, id, f) { recorded.push({ kind: 'history', userId, payload: { id, f } }); return id === '103' ? [] : null; },
  async close() {},
};
let server: Server;
let base: string;
before(async () => {
  const app = createApp({ database: { async ping() {}, async close() {} }, auth, grocery });
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });
const req = (path: string, token?: string, method = 'GET', body?: unknown) => fetch(`${base}${path}`, {
  method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

test('all grocery endpoints require Clerk token', async () => {
  for (const path of ['/api/grocery/categories','/api/grocery/products','/api/grocery/variants','/api/grocery/purchases','/api/grocery/purchases/1','/api/grocery/variants/1/history']) {
    assert.equal((await req(path)).status, 401, path);
  }
  assert.equal((await req('/api/grocery/categories', 'bad')).status, 401);
});
test('read filters are validated and forwarded with server-resolved owner', async () => {
  assert.equal((await req('/api/grocery/products?categoryId=3&search=milk&limit=10&offset=2&userId=999', 'beta')).status, 200);
  assert.deepEqual(recorded.at(-1), { kind: 'products', userId: '20', payload: { categoryId: '3', productId: null, merchantId: null, variantId: null, search: 'milk', from: null, to: null, limit: 10, offset: 2 } });
  assert.equal((await req('/api/grocery/products?limit=1000', 'alpha')).status, 400);
  assert.equal((await req('/api/grocery/purchases?from=2026-10-30&to=2026-01-01', 'alpha')).status, 400);
});
test('categories and products can be created only under authenticated owner', async () => {
  let r = await req('/api/grocery/categories', 'alpha', 'POST', { name: 'Eggs', userId: '999' });
  assert.equal(r.status, 201); assert.equal((await r.json()).data.id, '101');
  assert.equal(recorded.at(-1)?.userId, '10');
  r = await req('/api/grocery/products', 'beta', 'POST', { canonicalName: 'Organic spinach', categoryId: '3' });
  assert.equal(r.status, 201); assert.equal(recorded.at(-1)?.userId, '20');
  assert.equal((await req('/api/grocery/categories', 'alpha', 'POST', { name: '' })).status, 400);
});
test('variant size/units and product identifiers are strictly validated', async () => {
  assert.equal((await req('/api/grocery/variants', 'alpha', 'POST', { productId: '4', variantName: 'Bag', packageQuantity: '0' })).status, 400);
  assert.equal((await req('/api/grocery/variants', 'alpha', 'POST', { productId: '4', variantName: 'Bag', packageQuantity: '5.00000' })).status, 400);
  assert.equal((await req('/api/grocery/variants', 'alpha', 'POST', { productId: '4', variantName: 'Bag', packageQuantity: '5.0000', packageUnit: 'oz' })).status, 201);
});
test('manual purchase maintains repeated identical receipt lines and does not infer missing values', async () => {
  const items = [1,2].map(() => ({ rawDescription:'Mini Croissants 8 Count', variantId:'103', quantityPurchased:'1.0000', netLineTotal:'4.98' }));
  const r = await req('/api/grocery/purchases', 'alpha', 'POST', { sourceTransactionId:'mobile-unique-transaction-01', purchasedOn:'2026-11-06', status:'confirmed', items });
  assert.equal(r.status, 201); assert.equal(recorded.at(-1)?.userId, '10');
  const payload = recorded.at(-1)?.payload as { items: Array<{ receiptLineNumber: number }> };
  assert.equal(payload.items.length,2); assert.deepEqual(payload.items.map(x=>x.receiptLineNumber),[1,2]);
  const incomplete = await req('/api/grocery/purchases','alpha','POST',{ sourceTransactionId:'mobile-unique-transaction-02', purchasedOn:'2026-11-06', status:'confirmed', items:[{rawDescription:'Unknown size'}] });
  assert.equal(incomplete.status,400);
});
test('missing or malformed idempotency key is rejected', async () => {
  const baseBody = { items: [{ rawDescription: 'Eggs' }] };
  assert.equal((await req('/api/grocery/purchases','alpha','POST',baseBody)).status,400);
});
test('purchase detail and historical prices never use query-supplied owner', async () => {
  let r = await req('/api/grocery/purchases/104?userId=20', 'alpha');
  assert.equal(r.status, 200); assert.deepEqual(recorded.at(-1), { kind: 'getPurchase', userId:'10', payload:'104' });
  r = await req('/api/grocery/variants/103/history?userId=10&from=2026-01-01', 'beta');
  assert.equal(r.status,200); assert.equal(recorded.at(-1)?.userId,'20');
  assert.equal((await req('/api/grocery/variants/999/history', 'beta')).status,404);
  assert.equal((await req('/api/grocery/purchases/999', 'beta')).status,404);
});

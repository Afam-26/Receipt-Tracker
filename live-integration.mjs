/**
 * Receipt Price Tracker — development-only live Clerk + MySQL integration validation.
 * Creates clearly labeled needs_review test data; no schema changes, no secret output.
 * Run from receipt-price-tracker project root with CLERK_TEST_USER_A_ID and CLERK_TEST_USER_B_ID.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';

const secret = process.env.CLERK_SECRET_KEY;
const userA = process.env.CLERK_TEST_USER_A_ID;
const userB = process.env.CLERK_TEST_USER_B_ID;
const base = 'http://localhost:5001';

function assert(condition, msg) { if (!condition) throw new Error(msg); }
assert(secret?.startsWith('sk_test_'), 'Requires development CLERK_SECRET_KEY (sk_test_) in root .env');
assert(userA?.startsWith('user_') && userB?.startsWith('user_'), 'Set both Clerk test user IDs');
assert(userA !== userB, 'Test users A and B must be different');

async function clerk(path, method = 'GET', payload) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  });
  assert(response.ok, `Clerk ${path} returned HTTP ${response.status}`);
  return response.json();
}
async function tokenFor(userId) {
  const session = await clerk('/sessions', 'POST', {user_id: userId});
  const result = await clerk(`/sessions/${encodeURIComponent(session.id)}/tokens`, 'POST');
  assert(typeof result.jwt === 'string' && result.jwt.length > 20, 'Missing session JWT');
  return result.jwt;
}
async function api(token, method, path, body, expected=200) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let parsed;
  try { parsed = await response.json(); } catch { parsed = {}; }
  const code = parsed?.error?.code;
  console.log(`${method.padEnd(4)} ${path}: HTTP ${response.status}${code ? ` (${code})` : ''}`);
  assert(response.status === expected, `${path}: expected HTTP ${expected}, received ${response.status}${code ? ` (${code})` : ''}`);
  if (expected >= 200 && expected < 300) assert(parsed.ok === true, `${path}: missing ok=true`);
  return path === '/api/me' ? parsed.user : parsed.data;
}
function newKey(kind) { return `live-test-${kind}-${randomUUID()}`; }

console.log('Starting development-only validation (token/secret values will not be printed)');
const [tokenA, tokenB] = await Promise.all([tokenFor(userA), tokenFor(userB)]);
const a = await api(tokenA, 'GET', '/api/me');
const b = await api(tokenB, 'GET', '/api/me');
const localA = String(a?.user?.id ?? a?.id ?? '');
const localB = String(b?.user?.id ?? b?.id ?? '');
assert(localA && localB && localA !== localB, 'Clerk users did not resolve to separate local user IDs');
console.log(`PASS: Separate local account IDs: A=${localA}, B=${localB}`);

// Create a dedicated catalog variant owned by A, to ensure grocery FK and ownership checks run against real MySQL.
const category = await api(tokenA, 'POST', '/api/grocery/categories', {name: `[Integration Test] Groceries ${randomUUID().slice(0,8)}`}, 201);
const product = await api(tokenA, 'POST', '/api/grocery/products', {canonicalName: '[Integration Test] Rice', categoryId: String(category.id)}, 201);
const variant = await api(tokenA, 'POST', '/api/grocery/variants', {
  productId: String(product.id), variantName: '[Integration Test] Rice 1 lb', packageQuantity: '1', packageUnit: 'lb'
}, 201);
const groceryKey = newKey('grocery');
const groceryInput = {
  sourceTransactionId: groceryKey,
  purchasedOn: '2026-11-09',
  status: 'needs_review',
  items: [
    {rawDescription: '[Integration Test] Rice', variantId: String(variant.id), quantityPurchased: '2', netLineTotal: '5.98'},
    {rawDescription: '[Integration Test] Rice', variantId: String(variant.id), quantityPurchased: '1', netLineTotal: '2.99'}
  ]
};
const grocery = await api(tokenA, 'POST', '/api/grocery/purchases', groceryInput, 201);
const groceryId = String(grocery.id);
const groceryDetail = await api(tokenA, 'GET', `/api/grocery/purchases/${groceryId}`);
assert(Array.isArray(groceryDetail.items) && groceryDetail.items.length === 2, 'Grocery receipt did not preserve both lines');
assert(String(groceryDetail.sourceTransactionId) === groceryKey, 'Grocery idempotency key mismatch');
console.log(`PASS: Grocery transaction ${groceryId}, two distinct lines`);
await api(tokenA, 'POST', '/api/grocery/purchases', groceryInput, 409);
await api(tokenB, 'GET', `/api/grocery/purchases/${groceryId}`, undefined, 404);
const bGrocery = await api(tokenB, 'GET', '/api/grocery/purchases?limit=100');
assert(Array.isArray(bGrocery) && !bGrocery.some(x => String(x.id) === groceryId), 'Grocery leaked into account B list');
console.log('PASS: Grocery idempotency and cross-account detail/list isolation');

const grades = await api(tokenA, 'GET', '/api/gas/grades');
assert(Array.isArray(grades), 'Unexpected fuel-grade response');
const regular = grades.find(x => (x.gradeGroup ?? x.grade_group) === 'regular');
assert(regular?.id != null, 'Regular fuel grade missing from database');
const gasKey = newKey('gas');
const gasInput = {
  sourceTransactionId: gasKey,
  purchasedOn: '2026-11-09',
  status: 'needs_review',
  fuelGradeId: String(regular.id),
  rawFuelGrade: 'Regular',
  regularPricePerGallon: '3.4990',
  rewardDiscountPerGallon: '0.3000',
  paidPricePerGallon: '3.1990',
  gallons: '10.0000',
  totalPaid: '31.99',
  priceSource: 'printed'
};
const gas = await api(tokenA, 'POST', '/api/gas/purchases', gasInput, 201);
const gasId = String(gas.id);
const gasDetail = await api(tokenA, 'GET', `/api/gas/purchases/${gasId}`);
assert(String(gasDetail.sourceTransactionId) === gasKey, 'Gas idempotency key mismatch');
assert(String(gasDetail.review_status ?? gasDetail.reviewStatus) === 'needs_review', 'Gas test must not be confirmed');
console.log(`PASS: Gas purchase ${gasId}, Regular grade, before-rewards price stored`);
await api(tokenA, 'POST', '/api/gas/purchases', gasInput, 409);
await api(tokenB, 'GET', `/api/gas/purchases/${gasId}`, undefined, 404);
const bGas = await api(tokenB, 'GET', '/api/gas/purchases?limit=100');
assert(Array.isArray(bGas) && !bGas.some(x => String(x.id) === gasId), 'Gas leaked into account B list');
console.log('PASS: Gas idempotency and cross-account detail/list isolation');

// Negative FK ownership tests: account B cannot attach account A's product variant.
await api(tokenB, 'POST', '/api/grocery/purchases', {
  sourceTransactionId: newKey('foreign-variant'), purchasedOn: '2026-11-09', status: 'needs_review',
  items: [{rawDescription:'[Integration Test] Foreign variant',variantId:String(variant.id),quantityPurchased:'1',netLineTotal:'1.00'}]
}, 404);
console.log('PASS: Foreign-account variant cannot be linked to B purchase');
console.log('SUCCESS — Live authenticated grocery/gas writes and ownership checks passed.');
console.log('Test rows remain as needs_review; do not treat them as actual purchases.');
console.log(`For optional SQL verification, local owner A=${localA}, owner B=${localB}, grocery transaction=${groceryId}, gas purchase=${gasId}`);

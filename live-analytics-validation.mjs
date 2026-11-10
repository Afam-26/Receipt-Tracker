/**
 * Receipt Price Tracker Phase 2B.5 — live, READ-ONLY analytics validation.
 * Uses development Clerk users from the already validated purchase integration test.
 * No schema changes, writes, audit writes, token printing, or test-data cleanup.
 */
import 'dotenv/config';

const secret = process.env.CLERK_SECRET_KEY;
const userA = process.env.CLERK_TEST_USER_A_ID;
const userB = process.env.CLERK_TEST_USER_B_ID;
const base = (process.env.RECEIPT_API_BASE_URL || 'http://localhost:5001').replace(/\/$/, '');
const assert = (ok, message) => { if (!ok) throw new Error(message); };

assert(secret?.startsWith('sk_test_'), 'Use a Clerk DEVELOPMENT secret (sk_test_) from the local .env');
assert(userA?.startsWith('user_') && userB?.startsWith('user_') && userA !== userB,
  'Set two distinct CLERK_TEST_USER_A_ID and CLERK_TEST_USER_B_ID environment variables');
assert(/^http:\/\/(localhost|127\.0\.0\.1):5001$/.test(base),
  'Safety check: RECEIPT_API_BASE_URL must be local HTTP on port 5001');

async function clerk(path, method = 'GET', data) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    method, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {})
  });
  assert(response.ok, `Clerk development API responded HTTP ${response.status}`);
  return response.json();
}
async function tokenFor(userId) {
  const session = await clerk('/sessions', 'POST', { user_id: userId });
  assert(session?.id, 'Clerk session creation returned no session ID');
  const result = await clerk(`/sessions/${encodeURIComponent(session.id)}/tokens`, 'POST');
  assert(typeof result?.jwt === 'string' && result.jwt.length > 20, 'Clerk did not issue a session token');
  return result.jwt; // In memory only; never printed or saved.
}
async function api(token, path, expected = 200) {
  const response = await fetch(`${base}${path}`, {headers: {Authorization: `Bearer ${token}`}});
  let data;
  try { data = await response.json(); } catch { data = {}; }
  const code = data?.error?.code;
  console.log(`GET ${path}: HTTP ${response.status}${code ? ` (${code})` : ''}`);
  assert(response.status === expected, `${path}: expected HTTP ${expected}, got ${response.status}`);
  if (expected === 200) assert(data?.ok === true, `${path}: response does not have ok=true`);
  return data;
}
const encode = v => encodeURIComponent(String(v));
const id = v => String(v ?? '');
const data = x => x.data;
const arr = (x, field) => { assert(Array.isArray(x), `${field} must be an array`); return x; };
const hasId = (list, needle, key='id') => list.some(row => id(row?.[key]) === id(needle));
const isReview = row => row?.status === 'needs_review' || row?.reviewStatus === 'needs_review' || row?.review_status === 'needs_review';

// Page through owned records to find specifically labeled integration tests from Phase 2B.4.
async function findInPages(token, endpoint, test, maxPages=20) {
  for(let offset=0; offset<maxPages*100; offset+=100) {
    const sep=endpoint.includes('?') ? '&' : '?';
    const response=data(await api(token,`${endpoint}${sep}limit=100&offset=${offset}`));
    const page=arr(response,endpoint);
    const found=page.find(test);
    if(found) return found;
    if(page.length<100) break;
  }
  return null;
}

console.log('Phase 2B.5 READ-ONLY live analytics validation');
console.log('No session tokens, emails, or secret values will be displayed.');
console.log('This test creates temporary Clerk sessions but makes GET-only requests to the Receipt API.');

const [tokenA, tokenB] = await Promise.all([tokenFor(userA),tokenFor(userB)]);
const [meA,meB] = await Promise.all([api(tokenA,'/api/me'),api(tokenB,'/api/me')]);
const localA=id(meA.user?.user?.id ?? meA.user?.id);
const localB=id(meB.user?.user?.id ?? meB.user?.id);
assert(localA && localB && localA!==localB,'User A and B did not map to distinct local IDs');
console.log(`PASS: Two real Clerk sessions resolve to separate accounts A=${localA}, B=${localB}`);

const groceryTest = await findInPages(tokenA, '/api/grocery/purchases',
  row => String(row?.sourceTransactionId ?? '').startsWith('live-test-grocery-') && isReview(row));
assert(groceryTest, 'Could not find existing User A needs_review grocery test purchase. Recheck prior integration data.');
const groceryId=id(groceryTest.id);
const product = await findInPages(tokenA,'/api/grocery/products?search=Rice',
  row => String(row?.canonicalName ?? '').includes('[Integration Test] Rice'));
assert(product?.id, 'Could not locate User A integration-test Rice product');
const productId=id(product.id);
console.log(`Found User A review-only grocery purchase ${groceryId} and product ${productId}`);

const trendPath=`/api/analytics/grocery/trends?productId=${encode(productId)}&limit=100`;
const merchantPath=`/api/analytics/grocery/merchants?productId=${encode(productId)}&limit=100`;
const [trends,merchants]=await Promise.all([api(tokenA,trendPath),api(tokenA,merchantPath)]);
const trendData=data(trends), merchantData=data(merchants);
const observations=arr(trendData?.observations,'grocery observations');
const merchantRows=arr(merchantData?.merchants,'merchant comparisons');
assert(id(trendData.productId)===productId && id(merchantData.productId)===productId,'Grocery analytics product scope mismatch');
assert(!hasId(observations,groceryId,'transactionId'),'Review-only grocery test purchase leaked into confirmed trends');
assert(observations.every(o=>id(o.productId)===productId),'Cross-product grocery observation leaked into trends');
assert(merchantRows.every(m=>Number.isInteger(m.sampleCount) && m.sampleCount>0),'Invalid merchant sample counts');
console.log(`PASS: Grocery trends (${observations.length} confirmed observations) exclude review-only purchase`);
console.log(`PASS: Merchant comparison (${merchantRows.length} groups) returns valid scoped summaries`);

await api(tokenB,trendPath,404);
await api(tokenB,merchantPath,404);
console.log('PASS: User B cannot access User A product trends or merchant comparisons');

const gasTest=await findInPages(tokenA,'/api/gas/purchases',
  row => String(row?.sourceTransactionId ?? '').startsWith('live-test-gas-') && isReview(row));
assert(gasTest?.id, 'Could not find existing User A needs_review gas test purchase. Recheck prior integration data.');
const gasId=id(gasTest.id);

const [aDashResp,bDashResp]=await Promise.all([
  api(tokenA,'/api/analytics/gas/dashboard?limit=100'),
  api(tokenB,'/api/analytics/gas/dashboard?limit=100')
]);
const aDash=data(aDashResp), bDash=data(bDashResp);
const required=['fuelAssumptions','priceIncreaseRankings','allRecordedGasEntries','allGasPurchases','confirmedChartHistory','costImpact','pagination'];
assert(required.every(k=>Object.hasOwn(aDash,k)),'Gas dashboard missing required section(s)');
assert(Object.keys(aDash).slice(0,4).join('|')===required.slice(0,4).join('|'),
  'Gas dashboard first four sections not in required order');
const aRecorded=arr(aDash.allRecordedGasEntries,'A recorded gas entries');
const aPurchases=arr(aDash.allGasPurchases,'A gas purchases');
const aChart=arr(aDash.confirmedChartHistory,'A chart history');
const aRanks=arr(aDash.priceIncreaseRankings,'A rankings');
const bRecorded=arr(bDash.allRecordedGasEntries,'B recorded gas entries');
const bPurchases=arr(bDash.allGasPurchases,'B gas purchases');
const bChart=arr(bDash.confirmedChartHistory,'B chart history');
const bRanks=arr(bDash.priceIncreaseRankings,'B rankings');
assert(hasId(aRecorded,gasId) && hasId(aPurchases,gasId),
  `Existing review-only gas purchase ${gasId} not present in User A dashboard purchase lists`);
assert(!hasId(bRecorded,gasId) && !hasId(bPurchases,gasId), 'User A gas purchase visible in User B dashboard');
assert(!hasId(aChart,gasId) && !hasId(bChart,gasId), 'Review-only gas purchase leaked into confirmed chart');
// Rankings may use nested observations; no confirmed ranking should originate from this review-only purchase.
assert(!aRanks.some(r=>[r?.newPurchaseId,r?.previousPurchaseId].some(v=>id(v)===gasId)),
  'Review-only gas purchase leaked into rankings');
assert(!bRanks.some(r=>[r?.newPurchaseId,r?.previousPurchaseId].some(v=>id(v)===gasId)),
  'User A gas purchase leaked into User B rankings');
console.log(`PASS: Gas dashboard sections and order verified; review-only purchase ${gasId} excluded from chart/rankings`);
console.log('PASS: Separate account dashboards do not expose User A gas purchase to User B');

// Cross-check dashboard against existing live endpoints for both identities; all results use identical filters.
for(const [label,token,dash] of [['A',tokenA,aDash],['B',tokenB,bDash]]) {
  const [settings,history,rankings,impact,purchases]=await Promise.all([
    api(token,'/api/gas/settings'),
    api(token,'/api/gas/history?limit=100'),
    api(token,'/api/gas/rankings?limit=100'),
    api(token,'/api/gas/impact'),
    api(token,'/api/gas/purchases?limit=100')
  ]);
  assert(JSON.stringify(dash.fuelAssumptions)===JSON.stringify(data(settings)),`${label}: dashboard assumptions differ from settings`);
  assert(JSON.stringify(dash.confirmedChartHistory)===JSON.stringify(data(history)),`${label}: dashboard chart differs from history endpoint`);
  assert(JSON.stringify(dash.priceIncreaseRankings)===JSON.stringify(data(rankings)),`${label}: dashboard ranks differ from ranking endpoint`);
  assert(JSON.stringify(dash.costImpact)===JSON.stringify(data(impact)),`${label}: dashboard impact differs from impact endpoint`);
  assert(JSON.stringify(dash.allGasPurchases)===JSON.stringify(data(purchases)),`${label}: dashboard list differs from purchase endpoint`);
  console.log(`PASS: User ${label} dashboard matches independent settings/history/rankings/impact/purchases APIs`);
}

console.log('SUCCESS — Phase 2B.5 live analytics, review exclusion, and cross-account read isolation passed.');
console.log('Receipt database was not modified. Prior needs_review test purchases remain unchanged.');

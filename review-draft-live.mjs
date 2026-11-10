/**
 * Read/write development fixture: saves ONE review draft for an existing OCR test
 * receipt. NEVER confirms. Intentionally does not print token, receipt text, or money.
 */
import 'dotenv/config';

const userA = process.env.CLERK_TEST_USER_A_ID;
const userB = process.env.CLERK_TEST_USER_B_ID;
const id = process.env.OCR_TEST_RECEIPT_ID || '2';
const key = process.env.CLERK_SECRET_KEY;
const base = process.env.RECEIPT_API_URL || 'http://localhost:5001';
function assert(ok, message) { if (!ok) throw new Error(message); }
assert(key && userA?.startsWith('user_') && userB?.startsWith('user_') && userA !== userB, 'Set CLERK_SECRET_KEY and two different CLERK_TEST_USER_{A,B}_ID values');
assert(/^[1-9]\d*$/.test(id), 'Set numeric OCR_TEST_RECEIPT_ID');
assert(/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(base), 'Only a localhost API URL is permitted');

async function clerk(path, options={}) {
 const response = await fetch('https://api.clerk.com/v1'+path, { ...options, headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'} });
 if (!response.ok) throw Error('Clerk development API returned HTTP '+response.status);
 return response.json();
}
async function tokenFor(userId){
 const session=await clerk('/sessions',{method:'POST',body:JSON.stringify({user_id:userId})});
 const token=(await clerk('/sessions/'+encodeURIComponent(session.id)+'/tokens',{method:'POST'})).jwt;
 assert(token,'No Clerk session token returned');return token;
}
async function api(token,method,path,body) {
 const res=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
 let data;try{data=await res.json();}catch{data={};}
 console.log(method+' '+path+': HTTP '+res.status+(data.error?.code?' ('+data.error.code+')':''));
 return {status:res.status,data};
}
const a = await tokenFor(userA), b = await tokenFor(userB);
const path='/api/receipts/'+id+'/review';
const [start,foreign]=await Promise.all([api(a,'GET',path),api(b,'GET',path)]);
assert(start.status===200 && start.data.data?.status==='needs_review' && start.data.data?.extraction?.id, 'User A receipt must be OCR-extracted and needs_review');
assert(foreign.status===404,'User B must not see User A receipt');
console.log('PASS: User B cannot read User A review');
const initial=start.data.data;
// Save a minimal, deliberately NON-confirmable test draft (no variant, quantities or prices).
// This avoids trusting OCR amounts and prevents any accidental analytics entry.
const draft={extractionId:initial.extraction.id,receiptType:'grocery',purchasedOn:null,merchantId:null,grandTotal:null,
 items:[{rawDescription:'TEST DRAFT ONLY - NOT FOR CONFIRMATION',variantId:null,quantityPurchased:null,measurementUnit:null,measuredAmount:null,listedUnitPrice:null,grossLineTotal:null,netLineTotal:null}]};
const saved=await api(a,'PUT',path,{expectedRevision:initial.revision??null,draft});
assert(saved.status===200 && saved.data.data?.revision && saved.data.data.revision!==initial.revision,'Failed to create a new revision');
const revision=saved.data.data.revision;
const after=await api(a,'GET',path);
assert(after.status===200 && after.data.data?.revision===revision && after.data.data?.draft?.items?.[0]?.rawDescription===draft.items[0].rawDescription,'Saved draft did not roundtrip');
console.log('PASS: Draft saved, retrieved, and revision advanced; no confirmation performed');
const stale=await api(a,'PUT',path,{expectedRevision:initial.revision??null,draft});
assert(stale.status===409 && stale.data.error?.code==='STALE_REVIEW','Stale revision was not rejected');
console.log('PASS: Stale edits rejected');
const attack=await api(b,'PUT',path,{expectedRevision:revision,draft});
assert(attack.status===404,'User B changed or located User A review');
console.log('PASS: Cross-account write blocked');
const final=await api(a,'GET',path);
assert(final.status===200&&final.data.data?.status==='needs_review'&&final.data.data?.revision===revision,'Receipt was unexpectedly finalized');
console.log('SUCCESS: Phase 3C draft persistence, revision safety, and cross-account isolation passed.');
console.log('No purchase was confirmed. Fixture receipt '+id+' now has an intentionally incomplete review draft.');

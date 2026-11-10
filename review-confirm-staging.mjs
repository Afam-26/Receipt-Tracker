/**
 * DANGEROUS: deliberately confirms a fictional purchase. STAGING ONLY.
 * Never point your local API or DATABASE_URL at a production database.
 * Requires a separately uploaded + OCR-extracted STAGING receipt owned by user A.
 */
import 'dotenv/config';

const key=process.env.CLERK_SECRET_KEY;
const userA=process.env.CLERK_TEST_USER_A_ID;
const userB=process.env.CLERK_TEST_USER_B_ID;
const receiptId=process.env.STAGING_REVIEW_RECEIPT_ID;
const variantId=process.env.STAGING_REVIEW_VARIANT_ID;
const base=process.env.RECEIPT_API_URL;
function assert(ok,message){if(!ok)throw Error(message);}
assert(process.env.REVIEW_CONFIRM_DISPOSABLE_STAGING==='YES_I_VERIFIED_SEPARATE_STAGING_DATABASE', 'Confirmation disabled. Requires REVIEW_CONFIRM_DISPOSABLE_STAGING=YES_I_VERIFIED_SEPARATE_STAGING_DATABASE');
assert(process.env.RAILWAY_ENVIRONMENT!=='production' && process.env.NODE_ENV!=='production','Production environment detected; refusing');
assert(base && /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(base), 'Set RECEIPT_API_URL to localhost connected ONLY to a disposable staging database');
assert(key && userA?.startsWith('user_') && userB?.startsWith('user_') && userA!==userB,'Configure Clerk development users');
assert(/^[1-9]\d*$/.test(receiptId||'') && /^[1-9]\d*$/.test(variantId||''),'Set numeric STAGING_REVIEW_RECEIPT_ID and STAGING_REVIEW_VARIANT_ID owned by user A');
console.log('STAGING-ONLY: This run permanently confirms a FICTIONAL grocery purchase.');
console.log('Operator assertion: local API must be connected to a separate disposable staging database.');
async function clerk(path, options={}){
 const r=await fetch('https://api.clerk.com/v1'+path,{...options,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'}});
 if(!r.ok)throw Error('Clerk session operation HTTP '+r.status);return r.json();
}
async function tokenFor(userId){const s=await clerk('/sessions',{method:'POST',body:JSON.stringify({user_id:userId})});const t=(await clerk(`/sessions/${encodeURIComponent(s.id)}/tokens`,{method:'POST'})).jwt;assert(t,'No token');return t;}
async function api(token,method,path,body){
 const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
 const out=await r.json().catch(()=>({}));console.log(method+' '+path+': HTTP '+r.status+(out.error?.code?' ('+out.error.code+')':''));return {status:r.status,data:out};
}
const a=await tokenFor(userA),b=await tokenFor(userB);
const path='/api/receipts/'+receiptId+'/review';
const original=await api(a,'GET',path);
assert(original.status===200 && original.data.data?.status==='needs_review' && original.data.data?.extraction?.id,'Stage a fresh OCR-completed needs_review receipt under A');
const draft={extractionId:original.data.data.extraction.id,receiptType:'grocery',purchasedOn:'2026-11-10',merchantId:null,grandTotal:'4.29',
 items:[{rawDescription:'STAGING ONLY - TEST MILK',variantId,quantityPurchased:'1',measurementUnit:null,measuredAmount:null,listedUnitPrice:'4.29',grossLineTotal:'4.29',netLineTotal:'4.29'}]};
const save=await api(a,'PUT',path,{expectedRevision:original.data.data.revision??null,draft});
assert(save.status===200 && save.data.data?.revision,'Cannot save staging draft');
const revision=save.data.data.revision;
const denied=await api(b,'POST',path+'/confirm',{expectedRevision:revision,acknowledged:true});
assert(denied.status===404,'B was able to locate A receipt');
const premature=await api(a,'POST',path+'/confirm',{expectedRevision:revision,acknowledged:false});
assert(premature.status===400,'Confirmation without acknowledgement was accepted');
const confirmed=await api(a,'POST',path+'/confirm',{expectedRevision:revision,acknowledged:true});
assert(confirmed.status===201 && confirmed.data.data?.status==='confirmed','Staging confirmation transaction did not commit');
const transactionId=confirmed.data.data.transactionId;
const again=await api(a,'POST',path+'/confirm',{expectedRevision:revision,acknowledged:true});
assert(again.status===409,'Duplicate confirmation did not fail');
const aDetail=await api(a,'GET','/api/grocery/purchases/'+transactionId);
assert(aDetail.status===200 && aDetail.data.data?.status==='confirmed' && aDetail.data.data?.items?.length===1,'Confirmed grocery transaction missing line');
const bDetail=await api(b,'GET','/api/grocery/purchases/'+transactionId);
assert(bDetail.status===404,'B can read confirmed purchase');
const end=await api(a,'GET',path);
assert(end.status===200 && end.data.data?.status==='confirmed','Receipt status not finalized');
console.log('SUCCESS: Staging-only confirmed purchase is atomic, idempotent and owner-scoped.');
console.log('Confirmed staging transaction ID: '+transactionId+'; do not import this fictional test into production.');

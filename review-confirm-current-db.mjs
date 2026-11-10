/**
 * Receipt Price Tracker Phase 3C live confirmation test on the CURRENT dev/prelaunch database.
 * Modes:
 *   node review-confirm-current-db.mjs prepare /tmp/test-receipt.png
 *   REVIEW_CONFIRM_CURRENT_DB=YES_I_ACCEPT_TEST_DATA_IN_CURRENT_DB node review-confirm-current-db.mjs confirm
 *
 * No credentials or tokens are printed or stored. The receipt, product and variant,
 * confirmed purchase, line, OCR extraction and audit records remain for later controlled cleanup.
 * Back up the database before using. Do not use after public launch.
 */
import 'dotenv/config';
import {readFile,writeFile,stat,open} from 'node:fs/promises';
import {basename,extname} from 'node:path';
import {randomUUID} from 'node:crypto';
const mode=process.argv[2];
const userA=process.env.CLERK_TEST_USER_A_ID, userB=process.env.CLERK_TEST_USER_B_ID;
const secret=process.env.CLERK_SECRET_KEY;
const base=process.env.RECEIPT_API_URL || 'http://localhost:5001';
const manifest='/tmp/receipt-tracker-phase3c-confirm-manifest.json';
const marker='PHASE3C-TEST-'+randomUUID().slice(0,8).toUpperCase();
const assert=(condition,message)=>{if(!condition)throw Error(message);};
assert(mode==='prepare'||mode==='confirm','Usage: node review-confirm-current-db.mjs prepare /tmp/test-receipt.png OR ... confirm');
assert(/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(base),'For safety, only localhost API is supported');
assert(secret?.startsWith('sk_test_'),'A Clerk DEVELOPMENT secret is required; refusing to use production Clerk credentials');
assert(userA?.startsWith('user_')&&userB?.startsWith('user_')&&userA!==userB,'Set two distinct Clerk test user IDs');
async function clerk(path,body){
 const r=await fetch('https://api.clerk.com/v1'+path,{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert(r.ok,'Clerk development session HTTP '+r.status);return r.json();
}
async function getToken(userId){const s=await clerk('/sessions',{user_id:userId});const t=await clerk(`/sessions/${encodeURIComponent(s.id)}/tokens`,{});assert(t.jwt,'Clerk did not return a JWT');return t.jwt;}
async function api(token,method,path,body,headers={}){
 const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token,...headers,...(body && !(body instanceof Uint8Array)?{'Content-Type':'application/json'}:{})},body:body instanceof Uint8Array?body:(body===undefined?undefined:JSON.stringify(body))});
 const result=await response.json().catch(()=>({}));
 console.log(`${method} ${path}: HTTP ${response.status}${result.error?.code?' ('+result.error.code+')':''}`);
 return {status:response.status,data:result.data ?? (path === '/api/me' ? {user:result.user} : undefined),error:result.error};
}
function must(result,status,context){assert(result.status===status,`${context}: expected ${status}, got ${result.status}${result.error?.code?' '+result.error.code:''}`);return result.data;}
async function saveManifest(value){const fd=await open(manifest,'wx',0o600);try{await fd.writeFile(JSON.stringify(value,null,2));}finally{await fd.close();}}
async function loadManifest(){return JSON.parse(await readFile(manifest,'utf8'));}
async function users(){
 const [a,b]=await Promise.all([getToken(userA),getToken(userB)]);
 const am=must(await api(a,'GET','/api/me'),200,'A auth');
 const bm=must(await api(b,'GET','/api/me'),200,'B auth');
 const idA=String(am.user?.id??am.id??''); const idB=String(bm.user?.id??bm.id??'');
 assert(idA&&idB&&idA!==idB,'Clerk test accounts are not distinct local database users');
 console.log('PASS: Clerk users map to separate local accounts');
 return {a,b,idA,idB};
}
if(mode==='prepare'){
 const file=process.argv[3];assert(file,'Supply a valid receipt JPEG, PNG, WebP or PDF path');
 try{await stat(manifest);throw Error(`Existing manifest ${manifest} found. Finish or archive prior test before preparing another.`);}catch(e){if(e.code!=='ENOENT')throw e;}
 const mime={'.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.webp':'image/webp','.pdf':'application/pdf'}[extname(file).toLowerCase()];
 assert(mime,'Only JPEG, PNG, WebP and PDF are supported');
 const st=await stat(file);assert(st.isFile()&&st.size>=100&&st.size<=10*1024*1024,'Image must be 100 bytes to 10 MiB');
 const {a,idA,idB}=await users();
 const image=await readFile(file);
 const uploaded=must(await api(a,'POST','/api/receipts',image,{'Content-Type':mime,'x-receipt-filename':encodeURIComponent(basename(file)),'x-receipt-type':'unknown'}),201,'Upload');
 const receiptId=String(uploaded.receiptId??'');assert(/^\d+$/.test(receiptId),'Upload did not return receiptId');
 console.log('New test receipt ID:',receiptId);
 // Persist identifying details immediately, even if later steps fail, for controlled cleanup.
 const record={marker,receiptId,ownerA:idA,ownerB:idB,productId:null,variantId:null,transactionId:null,status:'uploaded'};
 await saveManifest(record);
 const route=`/api/receipts/${receiptId}/ocr`;
 must(await api(a,'POST',route),202,'Queue OCR');
 let completed=false;
 for(let i=0;i<40;i++){
   await new Promise(resolve=>setTimeout(resolve,2000));
   const status=must(await api(a,'GET',route),200,'OCR status');
   if(status.jobStatus==='completed'){completed=true;break;}
   if(status.jobStatus==='failed')throw Error('OCR job failed. Inspect worker logs. Manifest preserved for cleanup.');
 }
 assert(completed,'OCR not yet completed. Keep worker running; manifest preserved');
 const reviewPath=`/api/receipts/${receiptId}/review`;
 const review=must(await api(a,'GET',reviewPath),200,'Review');
 assert(review.status==='needs_review'&&review.extraction?.id,'OCR extraction not ready for review');
 const product=must(await api(a,'POST','/api/grocery/products',{canonicalName:marker+' TEST PRODUCT',brand:null,categoryId:null}),201,'Create test product');
 const productId=String(product.id);assert(/^\d+$/.test(productId),'Product ID missing');record.productId=productId;await writeFile(manifest,JSON.stringify(record,null,2),{mode:0o600});
 const variant=must(await api(a,'POST','/api/grocery/variants',{productId,variantName:marker+' TEST VARIANT',packageQuantity:'1',packageUnit:'each',unitCount:'1',productCode:null,comparisonGroup:null}),201,'Create test variant');
 const variantId=String(variant.id);assert(/^\d+$/.test(variantId),'Variant ID missing');record.variantId=variantId;await writeFile(manifest,JSON.stringify(record,null,2),{mode:0o600});
 const draft={extractionId:review.extraction.id,receiptType:'grocery',purchasedOn:'2026-11-10',merchantId:null,grandTotal:'4.29',items:[{rawDescription:marker+' TEST LINE - NOT REAL PURCHASE',variantId,quantityPurchased:'1',measurementUnit:null,measuredAmount:null,listedUnitPrice:'4.29',grossLineTotal:'4.29',netLineTotal:'4.29'}]};
 const saved=must(await api(a,'PUT',reviewPath,{expectedRevision:review.revision??null,draft}),200,'Save review draft');
 assert(saved.revision,'Saved review draft has no revision');record.status='prepared';record.revision=String(saved.revision);await writeFile(manifest,JSON.stringify(record,null,2),{mode:0o600});
 must(await api(a,'GET',reviewPath),200,'Reload review');
 console.log('PREPARED: new OCR receipt and linked grocery variant with a saved review draft.');
 console.log('Test manifest:',manifest);
 console.log('Test-only source marker:',marker);
 console.log('No purchase has been confirmed.');
 console.log('To run confirmation on this PRELAUNCH DB after reviewing backup and test marker:');
 console.log('  REVIEW_CONFIRM_CURRENT_DB=YES_I_ACCEPT_TEST_DATA_IN_CURRENT_DB node review-confirm-current-db.mjs confirm');
}
if(mode==='confirm'){
 assert(process.env.REVIEW_CONFIRM_CURRENT_DB==='YES_I_ACCEPT_TEST_DATA_IN_CURRENT_DB','Confirmation disabled. Set REVIEW_CONFIRM_CURRENT_DB=YES_I_ACCEPT_TEST_DATA_IN_CURRENT_DB for this one command.');
 const data=await loadManifest();assert(data.status==='prepared'&&/^\d+$/.test(String(data.receiptId))&&/^\d+$/.test(String(data.variantId)),'Manifest must contain a prepared, unconfirmed fixture');
 const {a,b,idA,idB}=await users();assert(data.ownerA===idA&&data.ownerB===idB,'Fixture owners do not match current Clerk users');
 const route=`/api/receipts/${data.receiptId}/review`;
 const review=must(await api(a,'GET',route),200,'Read prepared review');
 assert(review.status==='needs_review'&&String(review.revision)===String(data.revision),'Fixture is not in expected review revision/state');
 assert(review.draft?.items?.length===1&&review.draft.items[0].rawDescription===data.marker+' TEST LINE - NOT REAL PURCHASE'&&String(review.draft.items[0].variantId)===String(data.variantId),'Review content does not match test manifest');
 must(await api(b,'POST',route+'/confirm',{expectedRevision:review.revision,acknowledged:true}),404,'Cross-account confirmation block');
 must(await api(a,'POST',route+'/confirm',{expectedRevision:review.revision,acknowledged:false}),400,'Missing acknowledgment block');
 // Explicit confirmation writes FICTIONAL confirmed prices and MUST be cleaned before launch.
 console.log('CONFIRMING FICTIONAL PRELAUNCH TEST PURCHASE. This will enter confirmed analytics until cleanup.');
 const confirmed=must(await api(a,'POST',route+'/confirm',{expectedRevision:review.revision,acknowledged:true}),201,'Confirm test receipt');
 assert(confirmed.status==='confirmed','Receipt confirmation response not confirmed');
 const transactionId=String(confirmed.transactionId??'');assert(/^\d+$/.test(transactionId),'Confirmed transaction ID missing');
 data.transactionId=transactionId;data.status='confirmed';await writeFile(manifest,JSON.stringify(data,null,2),{mode:0o600});
 must(await api(a,'POST',route+'/confirm',{expectedRevision:review.revision,acknowledged:true}),409,'Duplicate confirmation protection');
 const detail=must(await api(a,'GET',`/api/grocery/purchases/${transactionId}`),200,'Confirmed grocery detail');
 assert(detail.status==='confirmed'&&Array.isArray(detail.items)&&detail.items.length===1,'Transaction not confirmed with one line');
 assert(String(detail.items[0].variantId)===String(data.variantId)&&String(detail.items[0].netLineTotal)==='4.29','Confirmed grocery line differs from reviewed draft');
 must(await api(b,'GET',`/api/grocery/purchases/${transactionId}`),404,'B cannot read A confirmed transaction');
 const final=must(await api(a,'GET',route),200,'Confirmed receipt status');
 assert(final.status==='confirmed','Receipt not finalized');
 const history=must(await api(a,'GET',`/api/grocery/variants/${data.variantId}/history?limit=100`),200,'Confirmed variant price history');
 assert(Array.isArray(history)&&history.some(x=>String(x.transactionId)===transactionId),'Confirmed transaction not visible in variant price history');
 console.log('SUCCESS: Live confirmation, line persistence, idempotency, cross-account isolation and price-history integration all passed.');
 console.log('Fixture for later controlled cleanup:',JSON.stringify({marker:data.marker,ownerId:data.ownerA,receiptId:data.receiptId,productId:data.productId,variantId:data.variantId,transactionId}));
 console.log('Manifest:',manifest);
 console.log('IMPORTANT: This fictional confirmed purchase must be deleted safely before public launch. Do not delete the bucket or database records blindly.');
}

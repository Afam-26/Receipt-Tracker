// Development-only: creates a temporary Clerk session, queues OCR for an existing receipt, polls status.
// Never displays tokens, API keys, emails or extracted receipt content.
import 'dotenv/config';
const userId=process.env.CLERK_TEST_USER_A_ID;
const receiptId=process.env.OCR_TEST_RECEIPT_ID;
const key=process.env.CLERK_SECRET_KEY;
const base=process.env.RECEIPT_API_URL||'http://localhost:5001';
if(!userId?.startsWith('user_')||!key||!/^\d+$/.test(receiptId||''))throw Error('Set CLERK_TEST_USER_A_ID, OCR_TEST_RECEIPT_ID, and CLERK_SECRET_KEY in root .env');
if(!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base))throw Error('Smoke test only supports localhost URL');
async function clerk(path,opts={}){
 const r=await fetch(`https://api.clerk.com/v1${path}`,{...opts,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'}});
 if(!r.ok)throw Error(`Clerk HTTP ${r.status}`);return r.json();
}
const session=await clerk('/sessions',{method:'POST',body:JSON.stringify({user_id:userId})});
const token=(await clerk(`/sessions/${encodeURIComponent(session.id)}/tokens`,{method:'POST'})).jwt;
if(!token)throw Error('No Clerk token issued');
async function get(path,method='GET'){
 const r=await fetch(`${base}${path}`,{method,headers:{Authorization:`Bearer ${token}`}});
 const data=await r.json();console.log(method,path,`HTTP ${r.status}`,data.error?.code||'');return {status:r.status,data};
}
const route=`/api/receipts/${receiptId}/ocr`;
const submitted=await get(route,'POST');
if(submitted.status!==202){console.log('No new OCR queued. If HTTP 409, this receipt may already have an extraction.');process.exitCode=1;}
else {
 for(let n=0;n<25;n++){
   await new Promise(resolve=>setTimeout(resolve,2000));
   const result=await get(route);
   if(result.status!==200){process.exitCode=1;break;}
   if(['completed','failed'].includes(result.data.data?.jobStatus)){
     console.log('Final OCR job status:',result.data.data.jobStatus);
     console.log('Receipt status:',result.data.data.processingStatus);
     console.log('Extraction saved:',Boolean(result.data.data.extraction));
     if(result.data.data.jobStatus==='failed')process.exitCode=1;
     break;
   }
   if(n===24){console.log('OCR still queued/running; inspect worker logs.');process.exitCode=1;}
 }
}

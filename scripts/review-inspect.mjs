// Development-only read-only inspector. Uses Clerk test account, does not print credentials or tokens.
import 'dotenv/config';
const userId=process.env.CLERK_TEST_USER_A_ID;
const receiptId=process.env.OCR_TEST_RECEIPT_ID||'2';
const key=process.env.CLERK_SECRET_KEY;
const base=process.env.RECEIPT_API_URL||'http://localhost:5001';
if(!userId?.startsWith('user_')||!key||!/^[1-9]\d*$/.test(receiptId))throw Error('Configure CLERK_TEST_USER_A_ID, CLERK_SECRET_KEY and OCR_TEST_RECEIPT_ID');
if(!/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(base))throw Error('Only localhost testing is allowed');
async function clerk(path,options={}){
 const r=await fetch(`https://api.clerk.com/v1${path}`,{...options,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'}});
 if(!r.ok)throw Error(`Clerk API HTTP ${r.status}`);return r.json();
}
const session=await clerk('/sessions',{method:'POST',body:JSON.stringify({user_id:userId})});
const token=(await clerk(`/sessions/${encodeURIComponent(session.id)}/tokens`,{method:'POST'})).jwt;
if(!token)throw Error('Clerk session token unavailable');
const result=await fetch(`${base}/api/receipts/${receiptId}/review`,{headers:{Authorization:`Bearer ${token}`}});
const body=await result.json();
console.log(`GET review receipt ${receiptId}: HTTP ${result.status}`);
if(!result.ok){console.log('Code:',body.error?.code??'unknown');process.exitCode=1;}
else {
 const record=body.data;
 console.log('Receipt status:',record.status);
 console.log('Extraction ID:',record.extraction?.id??'not found');
 console.log('OCR classifier:',record.extraction?.data?.receiptType??'not found');
 console.log('OCR grocery line count:',record.extraction?.data?.groceryLines?.length??0);
 console.log('OCR has merchant candidate:',Boolean(record.extraction?.data?.merchant));
 console.log('OCR has date candidate:',Boolean(record.extraction?.data?.purchasedOn));
 console.log('OCR has total candidate:',Boolean(record.extraction?.data?.grandTotal));
 console.log('Saved review draft:',Boolean(record.draft));
 console.log('Draft revision:',record.revision??'none');
 console.log('No OCR text, financial values, tokens or credentials printed.');
}

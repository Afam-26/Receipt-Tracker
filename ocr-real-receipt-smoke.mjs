// Development-only live OCR test. Creates a new private receipt and an OCR job.
// Run: node ocr-real-receipt-smoke.mjs "/path/to/receipt.jpg"
// Does not print tokens, storage keys, file contents, emails or extracted values.
import 'dotenv/config';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';

const userId=process.env.CLERK_TEST_USER_A_ID;
const secret=process.env.CLERK_SECRET_KEY;
const base=process.env.RECEIPT_API_URL || 'http://localhost:5001';
const filename=process.argv[2];
const types={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.pdf':'application/pdf'};
if (!userId?.startsWith('user_') || !secret?.startsWith('sk_test_')) throw Error('Set development Clerk secret and CLERK_TEST_USER_A_ID');
if (!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(base)) throw Error('Only local API is allowed for this development smoke test');
if (!filename) throw Error('Usage: node ocr-real-receipt-smoke.mjs "/path/to/receipt.jpg"');
const mime=types[extname(filename).toLowerCase()];
if (!mime) throw Error('Supply JPEG, PNG, WebP or PDF receipt');
const info=await stat(filename);
if(!info.isFile() || info.size<100 || info.size>10*1024*1024) throw Error('Receipt must be a readable file, from 100 bytes to 10 MiB');
const bytes=await readFile(filename);
async function clerk(path, body){
 const res=await fetch(`https://api.clerk.com/v1${path}`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'content-type':'application/json'},body:JSON.stringify(body)});
 if(!res.ok) throw Error(`Clerk request HTTP ${res.status}`);
 return res.json();
}
const session=await clerk('/sessions',{user_id:userId});
const {jwt}=await clerk(`/sessions/${encodeURIComponent(session.id)}/tokens`,{});
if(!jwt) throw Error('No Clerk session JWT received');
const auth={Authorization:`Bearer ${jwt}`};
async function request(path,opts={}){
 const res=await fetch(`${base}${path}`,{...opts,headers:{...auth,...opts.headers}});
 let data={};try{data=await res.json();}catch{}
 console.log(`${opts.method||'GET'} ${path}: HTTP ${res.status}${data.error?.code?' ('+data.error.code+')':''}`);
 return {status:res.status,data};
}
console.log('Live OCR validation on a new file; credentials and extracted content will not be printed.');
const uploaded=await request('/api/receipts',{method:'POST',headers:{'content-type':mime,'x-receipt-filename':encodeURIComponent(basename(filename)),'x-receipt-type':'unknown'},body:bytes});
if(uploaded.status!==201) throw Error('Upload rejected. Confirm valid image/PDF format, permissions, storage and API logs.');
const receiptId=uploaded.data?.data?.receiptId;
if(!/^\d+$/.test(String(receiptId??''))) throw Error('Receipt upload succeeded but returned no numeric receipt ID');
console.log('New test receipt ID:',receiptId);
const route=`/api/receipts/${receiptId}/ocr`;
const queued=await request(route,{method:'POST'});
if(queued.status!==202) throw Error('OCR was not queued. Inspect API logs for error code.');
for(let i=0;i<30;i++){
 await new Promise(resolve=>setTimeout(resolve,2000));
 const result=await request(route);
 if(result.status!==200) throw Error('OCR status fetch failed');
 const state=result.data?.data?.jobStatus;
 if(state==='completed'){
  console.log('PASS: OCR completed. Extraction saved:',Boolean(result.data?.data?.extraction));
  console.log('Receipt status:',result.data?.data?.processingStatus);
  process.exit(0);
 }
 if(state==='failed') throw Error('OCR worker failed; check worker logs. Input may be unreadable or too low quality.');
}
throw Error('OCR is still queued/running; inspect worker process and logs.');

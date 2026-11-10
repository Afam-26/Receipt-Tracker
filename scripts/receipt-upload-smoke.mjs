// Optional LIVE test. Creates one real 'uploaded' receipt in the connected development DB + R2.
// Requires Clerk development instance + CLERK_TEST_USER_A_ID. No keys or JWTs printed.
import dotenv from 'dotenv';
dotenv.config({path:'.env',quiet:true});
const userId=process.env.CLERK_TEST_USER_A_ID;
const secret=process.env.CLERK_SECRET_KEY;
const base=process.env.API_PUBLIC_BASE_URL || 'http://localhost:5001';
if(!userId?.startsWith('user_')||!secret?.startsWith('sk_test_'))throw new Error('Set CLERK_TEST_USER_A_ID and development CLERK_SECRET_KEY');
async function clerk(path,body){
 const r=await fetch(`https://api.clerk.com/v1${path}`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'content-type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok)throw new Error(`Clerk HTTP ${r.status}`);return r.json();
}
const session=await clerk('/sessions',{user_id:userId});
const {jwt}=await clerk(`/sessions/${encodeURIComponent(session.id)}/tokens`,{});
if(!jwt)throw new Error('Clerk did not return a JWT');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/J6sAAAAASUVORK5CYII=','base64');
const upload=await fetch(base+'/api/receipts',{method:'POST',headers:{Authorization:`Bearer ${jwt}`,'content-type':'image/png','x-receipt-type':'unknown','x-receipt-filename':'dev-smoke-test.png'},body:png});
const uploaded=await upload.json();console.log('POST /api/receipts:',upload.status,uploaded.error?.code||'OK');
if(upload.status!==201)process.exit(1);
const {receiptId,fileId}=uploaded.data;
const headers={Authorization:`Bearer ${jwt}`};
const detail=await fetch(`${base}/api/receipts/${receiptId}`,{headers});
console.log('GET receipt metadata:',detail.status);if(detail.status!==200)process.exit(1);
const download=await fetch(`${base}/api/receipts/${receiptId}/files/${fileId}/download`,{headers});
console.log('GET private download:',download.status);
if(download.status!==200)process.exit(1);
const downloaded=Buffer.from(await download.arrayBuffer());
if(!downloaded.equals(png))throw new Error('Stored bytes do not match uploaded bytes');
console.log('PASS: Private R2 bytes and MySQL metadata round-trip, owner test user');
console.log('Created development-only receipt ID:',receiptId);

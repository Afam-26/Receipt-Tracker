import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import type { AuthServices } from '../src/auth/types.js';
import type { OcrStore } from '../src/ocr/store.js';

function fixture(){
 const seen: string[]=[];
 const auth={provider:{verify:async(token:string)=> token==='a'?'subject-a':token==='b'?'subject-b':Promise.reject(new Error('bad')),
 getIdentity:async(subject:string)=>({subject,email:`${subject}@example.test`})},
 store:{sync:async(identity:{subject:string})=>({id:identity.subject==='subject-a'?'5':'6',email:'test@example.test'}),getSettings:async()=>null}} as unknown as AuthServices;
 const ocr={enqueue:async(owner:string,id:string)=>{seen.push(`post:${owner}:${id}`);return owner==='5'?'12':'not_found';},
 status:async(owner:string,id:string)=>{seen.push(`get:${owner}:${id}`);return owner==='5'?{processingStatus:'needs_review',jobStatus:'completed',attempts:1,extraction:null}:null;},
 claim:async()=>null,complete:async()=>{},fail:async()=>{},close:async()=>{}} as OcrStore;
 const app=createApp({database:{ping:async()=>{},close:async()=>{}},auth,ocr});
 return {app,seen};
}
async function withServer(fn:(url:string,seen:string[])=>Promise<void>){const {app,seen}=fixture();const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const a=server.address();if(!a||typeof a==='string')throw new Error('missing address');try{await fn(`http://127.0.0.1:${a.port}`,seen);}finally{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}}
test('OCR endpoints require Clerk authorization and reject invalid IDs',async()=>withServer(async url=>{
 assert.equal((await fetch(url+'/api/receipts/1/ocr')).status,401);
 assert.equal((await fetch(url+'/api/receipts/1/ocr',{method:'POST'})).status,401);
 assert.equal((await fetch(url+'/api/receipts/nope/ocr',{headers:{authorization:'Bearer a'}})).status,400);
}));
test('OCR requests use authenticated account, not caller supplied owner',async()=>withServer(async(url,seen)=>{
 const a=await fetch(url+'/api/receipts/1/ocr?userId=6',{method:'POST',headers:{authorization:'Bearer a'}});
 assert.equal(a.status,202);assert.equal((await a.json()).data.status,'queued');
 const status=await fetch(url+'/api/receipts/1/ocr?userId=6',{headers:{authorization:'Bearer a'}});
 assert.equal(status.status,200);assert.equal((await status.json()).data.processingStatus,'needs_review');
 const other=await fetch(url+'/api/receipts/1/ocr',{headers:{authorization:'Bearer b'}});assert.equal(other.status,404);
 assert.deepEqual(seen,['post:5:1','get:5:1','get:6:1']);
}));

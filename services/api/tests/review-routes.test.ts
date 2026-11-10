import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import type { AuthServices } from '../src/auth/types.js';
import type { ReviewStore } from '../src/review/store.js';

const draft={extractionId:'1',receiptType:'grocery',purchasedOn:'2026-11-10',grandTotal:'4.29',items:[{rawDescription:'MILK',variantId:'17',quantityPurchased:'1',netLineTotal:'4.29'}]};
function setup(){
 const calls:string[]=[];
 const auth={provider:{verify:async(t:string)=>t==='a'?'sub-a':t==='b'?'sub-b':Promise.reject(new Error('invalid')),
  getIdentity:async(sub:string)=>({subject:sub,email:`${sub}@example.test`})},
  store:{sync:async(i:{subject:string})=>({id:i.subject==='sub-a'?'5':'6',email:'test@example.test'}),getSettings:async()=>null}} as unknown as AuthServices;
 const review={get:async(user:string,receipt:string)=>{calls.push(`get:${user}:${receipt}`);return user==='5'?{receiptId:receipt,status:'needs_review',extraction:{id:'1',provider:'tesseract',data:{}},draft:null,revision:null}:null;},
  save:async(user:string,receipt:string,value:unknown,revision:string|null)=>{calls.push(`save:${user}:${receipt}:${revision}`);return {receiptId:receipt,status:'needs_review',extraction:null,draft:value,revision:'4'};},
  confirm:async(user:string,receipt:string,revision:string)=>{calls.push(`confirm:${user}:${receipt}:${revision}`);return {receiptId:receipt,transactionId:'8',purchaseId:'8',receiptType:'grocery' as const,status:'confirmed' as const};},
  close:async()=>{}} as ReviewStore;
 const app=createApp({database:{ping:async()=>{},close:async()=>{}},auth,review});
 return {app,calls};
}
async function run(fn:(url:string,calls:string[])=>Promise<void>){
 const {app,calls}=setup();const server=app.listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const address=server.address();if(!address||typeof address==='string')throw new Error('No port');
 try{await fn(`http://127.0.0.1:${address.port}`,calls);}finally{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
}
test('review endpoints reject missing tokens',()=>run(async(url)=>{
 for(const [path,method] of [['/api/receipts/2/review','GET'],['/api/receipts/2/review','PUT'],['/api/receipts/2/review/confirm','POST']]){
  assert.equal((await fetch(url+path,{method})).status,401);
 }
}));
test('review retrieval uses authenticated owner',()=>run(async(url,calls)=>{
 const a=await fetch(url+'/api/receipts/2/review?userId=6',{headers:{authorization:'Bearer a'}});
 assert.equal(a.status,200);
 const b=await fetch(url+'/api/receipts/2/review',{headers:{authorization:'Bearer b'}});
 assert.equal(b.status,404);
 assert.deepEqual(calls,['get:5:2','get:6:2']);
}));
test('draft save requires valid body and sends owner from Clerk',()=>run(async(url,calls)=>{
 const res=await fetch(url+'/api/receipts/2/review?userId=6',{method:'PUT',headers:{authorization:'Bearer a','content-type':'application/json'},body:JSON.stringify({expectedRevision:null,draft})});
 assert.equal(res.status,200);assert.deepEqual(calls,['save:5:2:null']);
 const invalid=await fetch(url+'/api/receipts/2/review',{method:'PUT',headers:{authorization:'Bearer a','content-type':'application/json'},body:JSON.stringify({draft:{...draft,receiptType:'unknown'}})});
 assert.equal(invalid.status,400);
}));
test('confirm requires explicit acknowledgement and revision',()=>run(async(url,calls)=>{
 const request=(body:unknown)=>fetch(url+'/api/receipts/2/review/confirm',{method:'POST',headers:{authorization:'Bearer a','content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await request({expectedRevision:'4',acknowledged:false})).status,400);
 assert.equal((await request({acknowledged:true})).status,400);
 const result=await request({expectedRevision:'4',acknowledged:true});assert.equal(result.status,201);
 assert.deepEqual(calls,['confirm:5:2:4']);
}));

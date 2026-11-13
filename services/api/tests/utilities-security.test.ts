import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'mysql2/promise';
import type { AuthServices } from '../src/auth/types.js';
import { createApp } from '../src/app.js';

// In-memory SQL adapter isolates authorization and confirmation behavior without
// touching Railway. The same mock is used by both authenticated Clerk identities.
type Bill = Record<string, any>;
function setup() {
  const rows = new Map<string, Bill>();
  let nextId = 1;
  const read = (owner:string,id:string) => {
    const row=rows.get(id);
    return row?.userId===owner ? {...row} : null;
  };
  const query=async (sql:string, params:any[]=[]) => {
    if (/SELECT .* FROM utility_bills WHERE user_id=\? AND id=\?/s.test(sql)) {
      const row=read(String(params[0]),String(params[1]));
      return [row?[row]:[]];
    }
    if (/SELECT .* FROM utility_bills WHERE user_id=\?/s.test(sql)) {
      return [[...rows.values()].filter(row=>row.userId===String(params[0]))];
    }
    throw Error('Unexpected query: '+sql.slice(0,100));
  };
  const execute=async (sql:string,params:any[]=[]) => {
    if(sql.startsWith('INSERT INTO utility_bills')) {
      const owner=String(params[0]);
      if([...rows.values()].some(row=>row.userId===owner && row.idempotencyKey===params[1])) {
        const err=Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'});
        throw err;
      }
      const id=String(nextId++);
      rows.set(id,{id,userId:owner,idempotencyKey:params[1],category:params[2],providerName:params[3],
        serviceStart:params[5],serviceEnd:params[6],totalAmount:params[13],revision:1,status:'draft'});
      return [{insertId:Number(id),affectedRows:1}];
    }
    if(sql.startsWith('UPDATE utility_bills SET status=')) {
      const [owner,id,revision]=params.map(String);
      const row=read(owner,id);
      if(!row||row.status!=='draft'||row.revision!==Number(revision))return [{affectedRows:0}];
      rows.set(id,{...row,status:'confirmed',revision:row.revision+1});
      return [{affectedRows:1}];
    }
    if(sql.startsWith('UPDATE utility_bills SET')) {
      const owner=String(params[13]),id=String(params[14]),revision=Number(params[15]);
      const row=read(owner,id);
      if(!row||row.status!=='draft'||row.revision!==revision||row.idempotencyKey!==params[16])return [{affectedRows:0}];
      rows.set(id,{...row,revision:revision+1,totalAmount:params[11]});
      return [{affectedRows:1}];
    }
    throw Error('Unexpected execute: '+sql.slice(0,100));
  };
  const conn={query,execute,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}};
  const pool={query,execute,getConnection:async()=>conn} as unknown as Pool;
  const auth={provider:{verify:async(token:string)=>token==='a'?'sub-a':token==='b'?'sub-b':Promise.reject(Error('bad token')),
    getIdentity:async(subject:string)=>({subject,email:`${subject}@example.test`})},
    store:{sync:async(identity:{subject:string})=>({id:identity.subject==='sub-a'?'5':'6',email:'test@example.test'}),getSettings:async()=>null}}
  const typedAuth = auth as unknown as AuthServices;
  const app=createApp({database:{ping:async()=>{},close:async()=>{}},auth:typedAuth,utilities:{pool}});
  return {app,rows};
}
async function withApp(fn:(url:string)=>Promise<void>) {
  const {app}=setup();
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(r=>server.once('listening',r));
  const addr=server.address();if(!addr||typeof addr==='string')throw Error('Server has no port');
  try{await fn(`http://127.0.0.1:${addr.port}`);}finally{
    await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
}
const draft={idempotencyKey:'utility-security-test-001',category:'electricity',providerName:'Test Electric',serviceStart:'2026-10-01',serviceEnd:'2026-10-31',totalAmount:'120.50'};
const request=(url:string,token:string,method:string,body?:unknown)=>fetch(url,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});

test('utilities reject missing or invalid Clerk token',()=>withApp(async url=>{
  assert.equal((await fetch(url+'/api/utilities/bills')).status,401);
  assert.equal((await request(url+'/api/utilities/bills','invalid','GET')).status,401);
}));

test('Clerk account ownership scopes lists and individual bill details',()=>withApp(async url=>{
  const created=await request(url+'/api/utilities/bills','a','POST',draft);
  assert.equal(created.status,201);
  const id=String((await created.json()).data.id);
  const own=await request(url+`/api/utilities/bills/${id}`,'a','GET');assert.equal(own.status,200);
  const other=await request(url+`/api/utilities/bills/${id}`,'b','GET');assert.equal(other.status,404);
  const otherList=await request(url+'/api/utilities/bills?userId=5','b','GET');
  assert.equal(otherList.status,200);
  assert.equal((await otherList.json()).data.items.length,0);
}));

test('duplicate creation with identical key is rejected for same user',()=>withApp(async url=>{
  assert.equal((await request(url+'/api/utilities/bills','a','POST',draft)).status,201);
  const again=await request(url+'/api/utilities/bills','a','POST',draft);
  assert.equal(again.status,409);
  assert.equal((await again.json()).error.code,'DUPLICATE_UTILITY_BILL');
  assert.equal((await request(url+'/api/utilities/bills','b','POST',draft)).status,201);
}));

test('confirmation requires acknowledgment and revision; second confirmation returns conflict',()=>withApp(async url=>{
  const created=await request(url+'/api/utilities/bills','a','POST',draft);
  const id=String((await created.json()).data.id);
  const path=url+`/api/utilities/bills/${id}/confirm`;
  assert.equal((await request(path,'a','POST',{expectedRevision:1,acknowledged:false})).status,400);
  assert.equal((await request(path,'b','POST',{expectedRevision:1,acknowledged:true})).status,404);
  assert.equal((await request(path,'a','POST',{expectedRevision:1,acknowledged:true})).status,201);
  assert.equal((await request(path,'a','POST',{expectedRevision:1,acknowledged:true})).status,409);
  const data=await (await request(url+`/api/utilities/bills/${id}`,'a','GET')).json();
  assert.equal(data.data.status,'confirmed');assert.equal(data.data.revision,2);
}));

test('stale draft updates and cross-user edits are rejected without changing the bill',()=>withApp(async url=>{
  const created=await request(url+'/api/utilities/bills','a','POST',draft);
  assert.equal(created.status,201);
  const id=String((await created.json()).data.id);
  const path=url+`/api/utilities/bills/${id}`;
  const updated={...draft,expectedRevision:1,totalAmount:'135.00'};
  assert.equal((await request(path,'b','PUT',updated)).status,404);
  assert.equal((await request(path,'a','PUT',{...updated,expectedRevision:8})).status,409);
  assert.equal((await request(path,'a','PUT',updated)).status,200);
  assert.equal((await request(path,'a','PUT',updated)).status,409);
  const latest=await (await request(path,'a','GET')).json();
  assert.equal(latest.data.revision,2);
  assert.equal(latest.data.totalAmount,'135.00');
}));

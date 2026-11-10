import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {createApp} from '../src/app.js';
import type {AuthServices} from '../src/auth/types.js';
import type {AnalyticsStore} from '../src/analytics/store.js';
import type {GasStore} from '../src/gas/store.js';
const seen:Array<{resource:string;owner:string}>=[];
const auth:AuthServices={provider:{async verify(t){if(t==='a')return 'a';if(t==='b')return 'b';throw new Error('bad');},async getIdentity(subject){return {subject,email:null};}},store:{async sync(identity){return {id:identity.subject==='a'?'5':'6',subject:identity.subject,email:null};},async getSettings(){return null;},async close(){}}};
const analytics:AnalyticsStore={async grocery(owner,f){seen.push({resource:'grocery',owner});return f.productId==='44'?null:[{lineItemId:'1',transactionId:'1',purchasedOn:'2026-11-01',productId:f.productId,variantId:'2',variantName:'Rice',merchantId:'1',merchantName:'A',quantityPurchased:'2',netLineTotal:'10.00',packageQuantity:'500',packageUnit:'g',unitCount:null}];},async close(){}};
const gas:GasStore={async grades(){return [];},async list(owner){seen.push({resource:'list',owner});return [];},async get(){return null;},async create(){return {id:'1',transactionId:'1'};},async update(){return {id:'1'};},async history(owner){seen.push({resource:'history',owner});return [];},async rankings(owner){seen.push({resource:'rankings',owner});return [];},async impact(owner){seen.push({resource:'impact',owner});return {};},async settings(owner){seen.push({resource:'settings',owner});return {gallonsPerFillup:'13',fillsPerWeek:'1'};},async updateSettings(){return {gallonsPerFillup:'13',fillsPerWeek:'1'};},async close(){}};
let server:Server;let root:string;
before(async()=>{server=await new Promise(resolve=>{const s=createApp({database:{async ping(){},async close(){}},auth,gas,analytics}).listen(0,'127.0.0.1',()=>resolve(s));});root=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;});
after(async()=>{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));});
const request=(path:string,token?:string)=>fetch(root+path,{headers:token?{authorization:`Bearer ${token}`}:{}});
test('analytics endpoints require Clerk tokens',async()=>{for(const p of ['/api/analytics/grocery/trends?productId=1','/api/analytics/grocery/merchants?productId=1','/api/analytics/gas/dashboard'])assert.equal((await request(p)).status,401);});
test('grocery trends scoped to authenticated owner not query userId',async()=>{
 const r=await request('/api/analytics/grocery/trends?productId=3&userId=999','b');assert.equal(r.status,200);const body=await r.json();assert.equal(body.data.observations[0].pricePerStandardUnit,'1.0000');assert.equal(seen.at(-1)?.owner,'6');
});
test('grocery unknown product cannot reveal existence across account',async()=>{assert.equal((await request('/api/analytics/grocery/trends?productId=44','a')).status,404);});
test('invalid filters return 400',async()=>{assert.equal((await request('/api/analytics/grocery/merchants?productId=3&limit=400','a')).status,400);});
test('gas dashboard enforces owner for all underlying sections',async()=>{
 seen.length=0;const r=await request('/api/analytics/gas/dashboard?userId=999&mode=lowest','b');assert.equal(r.status,200);
 assert.deepEqual(new Set(seen.map(x=>x.resource)),new Set(['settings','rankings','list','history','impact']));assert.ok(seen.every(x=>x.owner==='6'));
 const data=(await r.json()).data;assert.deepEqual(Object.keys(data).slice(0,4),['fuelAssumptions','priceIncreaseRankings','allRecordedGasEntries','allGasPurchases']);
});

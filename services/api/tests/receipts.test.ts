import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { Readable } from 'node:stream';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import type { AuthServices } from '../src/auth/types.js';
import type { ReceiptStore, ReceiptMetadata } from '../src/receipts/store.js';
import type { ReceiptObjectStorage } from '../src/receipts/storage.js';
import { parseFilename, sniffMime, validateReceiptImage, MAX_RECEIPT_BYTES } from '../src/receipts/validation.js';

const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const events:Array<{action:string;owner?:string;key?:string}>=[];
const receipts=new Map<string,ReceiptMetadata>();
const objects=new Map<string,Buffer>();
let failStore=false,failStorage=false;
const auth:AuthServices={provider:{async verify(t){if(t==='a')return 'a';if(t==='b')return 'b';throw new Error('bad');},async getIdentity(subject){return {subject,email:null};}},store:{async sync(i){return {id:i.subject==='a'?'5':'6',subject:i.subject,email:null};},async getSettings(){return null;},async close(){}}};
const storage:ReceiptObjectStorage={
 async put(key,bytes){events.push({action:'put',key});if(failStorage)throw new Error('S3 failure private');objects.set(key,bytes);},
 async get(key){const bytes=objects.get(key);if(!bytes)throw new Error('not found');return {body:Readable.from([bytes]),mimeType:'image/png'};},
 async delete(key){events.push({action:'delete',key});objects.delete(key);},
};
const store:ReceiptStore={
 async create(userId,type,filename,image,key){events.push({action:'create',owner:userId,key});if(failStore)throw new Error('SQL failure private');const id=String(receipts.size+1);receipts.set(`${userId}:${id}`,{id,receiptType:type,processingStatus:'uploaded',primaryFileHash:image.sha256,duplicateOfId:null,createdAt:'2026-11-10',files:[{id:'1',receiptId:id,originalFilename:filename,mimeType:image.mimeType,fileHash:image.sha256,byteSize:String(image.bytes.length),uploadedAt:'2026-11-10'}]});return {receiptId:id,fileId:'1',duplicateOfId:null};},
 async list(userId){events.push({action:'list',owner:userId});return [...receipts].filter(([key])=>key.startsWith(`${userId}:`)).map(([,v])=>v);},
 async get(userId,id){events.push({action:'get',owner:userId});return receipts.get(`${userId}:${id}`)??null;},
 async file(userId,receiptId,fileId){events.push({action:'file',owner:userId});const r=receipts.get(`${userId}:${receiptId}`);if(!r||fileId!=='1')return null;const obj=events.find(e=>e.action==='create'&&e.owner===userId);return obj?.key?{key:obj.key,mimeType:'image/png',filename:'shop.png'}:null;},
 async close(){},
};
let server:Server,root:string;
before(async()=>{server=await new Promise(resolve=>{const s=createApp({database:{async ping(){},async close(){}},auth,receipts:{store,storage}}).listen(0,'127.0.0.1',()=>resolve(s));});root=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;});
after(async()=>{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));});
function send(token:string|undefined,body:Buffer=png,opts:Record<string,string>={}){return fetch(root+'/api/receipts',{method:'POST',headers:{...(token?{authorization:`Bearer ${token}`} :{}),'Content-Type':'image/png','X-Receipt-Filename':'shop.png','X-Receipt-Type':'grocery',...opts},body});}
const get=(path:string,token?:string)=>fetch(root+path,{headers:token?{authorization:`Bearer ${token}`}:{}});
test('unsupported file signatures and unsafe filenames are rejected',()=>{
 assert.equal(sniffMime(Buffer.from('bogus')),null);
 assert.equal(sniffMime(Buffer.from('%PDF-hello')),'application/pdf');
 assert.throws(()=>parseFilename('../secret'),/simple filename/);
 assert.throws(()=>validateReceiptImage(Buffer.alloc(0),'image/png'));
 assert.throws(()=>validateReceiptImage(Buffer.alloc(MAX_RECEIPT_BYTES+1),'image/png'));
 assert.throws(()=>validateReceiptImage(png,'image/jpeg'));
});
test('unauthenticated uploads and private reads return 401',async()=>{
 assert.equal((await send(undefined)).status,401);
 assert.equal((await get('/api/receipts')).status,401);
 assert.equal((await get('/api/receipts/1')).status,401);
 assert.equal((await get('/api/receipts/1/files/1/download')).status,401);
});
test('uploads require valid type, signature, filename',async()=>{
 assert.equal((await send('a',png,{'X-Receipt-Type':'private'})).status,400);
 assert.equal((await send('a',png,{'X-Receipt-Filename':'../bad'})).status,400);
 assert.equal((await send('a',png,{'Content-Type':'image/jpeg'})).status,415);
 assert.equal((await send('a',Buffer.from('garbage'))).status,415);
});
test('authenticated upload is private, metadata does not include key, file downloads are protected',async()=>{
 const r=await send('a');assert.equal(r.status,201);const json=await r.json();assert.equal(json.data.receiptId,'1');assert.equal(json.data.processingStatus,'uploaded');assert.equal(json.data.byteSize,png.length);assert.ok(!JSON.stringify(json).includes('receipts/5/'));
 const obj=events.find(e=>e.action==='create'&&e.owner==='5');assert.ok(obj?.key?.startsWith('receipts/5/'));
 const list=await get('/api/receipts?limit=10','a');assert.equal(list.status,200);assert.equal((await list.json()).data.length,1);
 assert.equal((await get('/api/receipts/1','a')).status,200);
 assert.equal((await get('/api/receipts/1','b')).status,404);
 assert.equal((await get('/api/receipts','b').then(r=>r.json())).data.length,0);
 assert.equal((await get('/api/receipts/1/files/1/download','b')).status,404);
 const download=await get('/api/receipts/1/files/1/download','a');assert.equal(download.status,200);assert.equal(download.headers.get('x-content-type-options'),'nosniff');assert.equal(Buffer.compare(Buffer.from(await download.arrayBuffer()),png),0);
 assert.ok(events.filter(e=>['list','get','file'].includes(e.action)).every(e=>e.owner==='5'||e.owner==='6'));
});
test('storage errors do not create metadata and SQL failures clean up R2 object',async()=>{
 const beforeCount=objects.size;failStorage=true;assert.equal((await send('a')).status,503);failStorage=false;assert.equal(objects.size,beforeCount);
 failStore=true;const r=await send('a');assert.equal(r.status,503);assert.equal((await r.json()).error.code,'RECEIPT_PERSISTENCE_FAILED');failStore=false;assert.equal(objects.size,beforeCount);assert.equal(events.at(-1)?.action,'delete');
});
test('query pagination and IDs are strictly validated',async()=>{
 assert.equal((await get('/api/receipts?limit=200','a')).status,400);
 assert.equal((await get('/api/receipts?offset=-1','a')).status,400);
 assert.equal((await get('/api/receipts/0','a')).status,400);
 assert.equal((await get('/api/receipts/99999','a')).status,404);
});
test('HTTP upload body greater than 10 MiB is rejected before storage',async()=>{
 const r=await send('a',Buffer.alloc(MAX_RECEIPT_BYTES+1,0));
 assert.equal(r.status,413);
});
test('duplicate bytes receive a unique receipt and private object key',async()=>{
 const before=events.filter(e=>e.action==='create'&&e.owner==='5').length;
 const r=await send('a');assert.equal(r.status,201);
 const created=events.filter(e=>e.action==='create'&&e.owner==='5');
 assert.equal(created.length,before+1);
 assert.notEqual(created.at(-1)?.key,created[0]?.key);
});

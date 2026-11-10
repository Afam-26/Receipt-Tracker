import 'dotenv/config';
import { readConfig } from '../config/env.js';
import { readRailwayBucketSettings, createRailwayBucketStorage } from '../receipts/storage.js';
import { createOcrStore } from './store.js';
import { createTesseractEngine } from './engine.js';
import { parseReceiptText } from './extract.js';

const config=readConfig();if(!config.databaseUrl)throw new Error('DATABASE_URL required');
const bucket=readRailwayBucketSettings();if(!bucket)throw new Error('Railway bucket credentials required');
const store=createOcrStore(config.databaseUrl), storage=createRailwayBucketStorage(bucket), engine=createTesseractEngine();
let running=true;
process.on('SIGTERM',()=>{running=false;});process.on('SIGINT',()=>{running=false;});
async function bytesFromStorage(key:string):Promise<Buffer> {
  if(!key)throw new Error('Receipt file missing');
  const result=await storage.get(key);const parts:Buffer[]=[];let size=0;
  for await(const chunk of result.body){const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=part.length;if(size>10*1024*1024)throw new Error('Stored receipt too large');parts.push(part);}
  return Buffer.concat(parts);
}
async function main(){
  console.log('Self-hosted OCR worker started (Tesseract)');
  try{while(running){
    const job=await store.claim();
    if(!job){await new Promise(resolve=>setTimeout(resolve,3000));continue;}
    try{const bytes=await bytesFromStorage(job.key);const text=await engine.extract(bytes,job.mimeType);if(text.trim().length<4)throw new Error('OCR returned insufficient text');
      await store.complete(job,parseReceiptText(text),text);
      console.log('OCR completed', {jobId:job.id,receiptId:job.receiptId});
    }catch(error){console.error('OCR failed', {jobId:job.id,reason:error instanceof Error?error.message:'unknown'});await store.fail(job);}
  }}finally{await store.close();}
}
main().catch(error=>{console.error('OCR worker terminated',error instanceof Error?error.message:'unknown');process.exitCode=1;});

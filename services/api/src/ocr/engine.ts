import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sniffMime } from '../receipts/validation.js';

export interface OcrEngine { extract(bytes: Buffer, declaredMime: string):Promise<string> }
function execFile(binary:string,args:string[],timeoutMs:number,outputLimit=150000):Promise<string> {
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{shell:false,stdio:['ignore','pipe','pipe'],env:{...process.env,OMP_THREAD_LIMIT:'1'}});
    let result='';let error='';let finished=false;
    const fail=(e:Error)=>{if(finished)return;finished=true;clearTimeout(timer);child.kill('SIGKILL');reject(e);};
    const timer=setTimeout(()=>fail(new Error('OCR command exceeded time limit')),timeoutMs);
    child.stdout.on('data',(chunk:Buffer)=>{result+=chunk.toString('utf8');if(result.length>outputLimit)fail(new Error('OCR output too large'));});
    child.stderr.on('data',(chunk:Buffer)=>{error=(error+chunk.toString('utf8')).slice(-1500);});
    child.on('error',()=>fail(new Error('OCR executable unavailable')));
    child.on('close',(code)=>{if(finished)return;finished=true;clearTimeout(timer);code===0?resolve(result):reject(new Error(`${binary} failed (${code}): ${error.slice(0,200)}`));});
  });
}
export function createTesseractEngine():OcrEngine {
  return {async extract(bytes,declaredMime){
    if(bytes.length===0||bytes.length>10*1024*1024)throw new Error('Invalid receipt file size');
    const actual=sniffMime(bytes);if(!actual||actual!==declaredMime)throw new Error('Receipt file signature mismatch');
    const dir=await mkdtemp(join(tmpdir(),'receipt-ocr-'));
    try{
      await chmod(dir,0o700);
      const suffix=actual==='application/pdf'?'pdf':actual==='image/png'?'png':actual==='image/webp'?'webp':'jpg';
      const input=join(dir,`input.${suffix}`);await writeFile(input,bytes,{mode:0o600});
      let images=[input];
      if(actual==='application/pdf'){
        // First eight pages only. Set 150 dpi to limit cost and memory.
        await execFile('pdftoppm',['-f','1','-l','8','-r','150','-png',input,join(dir,'page')],45000,1000);
        images=(await readdir(dir)).filter(name=>/^page-\d+\.png$/.test(name)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(name=>join(dir,name));
        if(!images.length)throw new Error('PDF produced no readable pages');
      }
      let text='';
      for(const image of images){text+=await execFile('tesseract',[image,'stdout','-l','eng','--psm','6'],30000)+'\n';if(text.length>120000)throw new Error('OCR text exceeded limit');}
      return text.slice(0,120000);
    }finally{await rm(dir,{recursive:true,force:true});}
  }};
}

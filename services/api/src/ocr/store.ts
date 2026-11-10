import { createPool, type Pool, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import type { ParsedReceipt } from './extract.js';

type Row=RowDataPacket & Record<string,unknown>;
export interface OcrJob {id:string;userId:string;receiptId:string;key:string;mimeType:string}
export interface OcrStore {
  enqueue(userId:string,receiptId:string):Promise<'not_found'|'busy'|string>;
  status(userId:string,receiptId:string):Promise<{processingStatus:string;jobStatus:string|null;attempts:number|null;extraction:{id:string;provider:string;createdAt:string;data:ParsedReceipt}|null}|null>;
  claim():Promise<OcrJob|null>;
  complete(job:OcrJob,result:ParsedReceipt,rawText:string):Promise<void>;
  fail(job:OcrJob):Promise<void>;
  close():Promise<void>;
}
export function createOcrStore(databaseUrl:string):OcrStore {
  const pool:Pool=createPool({uri:databaseUrl,connectionLimit:4,waitForConnections:true,timezone:'Z',dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});
  return {
    async enqueue(userId,receiptId){
      const cx=await pool.getConnection();try{
        await cx.beginTransaction();
        const [receipts]=await cx.execute<Row[]>('SELECT id,processing_status AS processingStatus FROM receipts WHERE id=? AND user_id=? FOR UPDATE',[receiptId,userId]);
        if(!receipts[0]){await cx.rollback();return 'not_found';}
        if(receipts[0].processingStatus==='confirmed'||receipts[0].processingStatus==='processing'||receipts[0].processingStatus==='needs_review') {await cx.rollback();return 'busy';}
        const [files]=await cx.execute<Row[]>('SELECT id FROM receipt_files WHERE receipt_id=? AND user_id=? LIMIT 1',[receiptId,userId]);
        if(!files[0]){await cx.rollback();return 'not_found';}
        const [jobs]=await cx.execute<Row[]>('SELECT id FROM receipt_processing_jobs WHERE receipt_id=? AND user_id=? AND status IN (\'queued\',\'running\') LIMIT 1',[receiptId,userId]);
        if(jobs.length){await cx.rollback();return 'busy';}
        const [insert]=await cx.execute<ResultSetHeader>(`INSERT INTO receipt_processing_jobs(user_id,receipt_id,job_type,status) VALUES (?,?,'ocr','queued')`,[userId,receiptId]);
        await cx.execute("UPDATE receipts SET processing_status='processing' WHERE user_id=? AND id=?",[userId,receiptId]);
        await cx.commit();return String(insert.insertId);
      }catch(err){await cx.rollback();throw err;}finally{cx.release();}
    },
    async status(userId,receiptId){
      const [receipts]=await pool.execute<Row[]>('SELECT processing_status AS processingStatus FROM receipts WHERE user_id=? AND id=? LIMIT 1',[userId,receiptId]);if(!receipts[0])return null;
      const [jobs]=await pool.execute<Row[]>('SELECT status,attempt_count AS attemptCount FROM receipt_processing_jobs WHERE user_id=? AND receipt_id=? AND job_type=\'ocr\' ORDER BY id DESC LIMIT 1',[userId,receiptId]);
      const [extractions]=await pool.execute<Row[]>('SELECT CAST(id AS CHAR) AS id,provider,raw_result AS rawResult,created_at AS createdAt FROM receipt_extractions WHERE user_id=? AND receipt_id=? ORDER BY id DESC LIMIT 1',[userId,receiptId]);
      let extraction=null;if(extractions[0]){const raw=extractions[0].rawResult;const record=typeof raw==='string'?JSON.parse(raw):raw;extraction={id:String(extractions[0].id),provider:String(extractions[0].provider),createdAt:String(extractions[0].createdAt),data:record as ParsedReceipt};}
      return {processingStatus:String(receipts[0].processingStatus),jobStatus:jobs[0]?String(jobs[0].status):null,attempts:jobs[0]?Number(jobs[0].attemptCount):null,extraction};
    },
    async claim(){
      const cx=await pool.getConnection();try{
        await cx.beginTransaction();
        const [rows]=await cx.query<Row[]>(`SELECT j.id,j.user_id AS userId,j.receipt_id AS receiptId FROM receipt_processing_jobs j WHERE j.status='queued' AND j.job_type='ocr' AND j.available_at<=NOW(3) ORDER BY j.id LIMIT 1 FOR UPDATE SKIP LOCKED`);
        if(!rows[0]){await cx.commit();return null;}
        const row=rows[0];const [files]=await cx.execute<Row[]>('SELECT storage_key AS storageKey,mime_type AS mimeType FROM receipt_files WHERE user_id=? AND receipt_id=? ORDER BY id LIMIT 1',[String(row.userId),String(row.receiptId)]);
        await cx.execute("UPDATE receipt_processing_jobs SET status='running',attempt_count=attempt_count+1,locked_at=NOW(3) WHERE id=?",[String(row.id)]);
        await cx.commit();
        return {id:String(row.id),userId:String(row.userId),receiptId:String(row.receiptId),key:files[0]?String(files[0].storageKey):'',mimeType:files[0]?String(files[0].mimeType):''};
      }catch(err){await cx.rollback();throw err;}finally{cx.release();}
    },
    async complete(job,result,rawText){
      const cx=await pool.getConnection();try{
        await cx.beginTransaction();
        // Raw OCR text is deliberately NOT persisted. It may contain private information.
        await cx.execute('INSERT INTO receipt_extractions(user_id,receipt_id,provider,provider_version,raw_result,confidence_data) VALUES (?,?,?,?,?,?)',
          [job.userId,job.receiptId,'self_hosted_tesseract','3b-v1',JSON.stringify(result),JSON.stringify({ocrCharacters:rawText.length,automaticallyConfirmed:false})]);
        await cx.execute("UPDATE receipts SET processing_status='needs_review',receipt_type=? WHERE user_id=? AND id=? AND processing_status='processing'",[result.receiptType,job.userId,job.receiptId]);
        const reviewFields:Array<[string,unknown]>= [['receiptType',result.receiptType],['merchant',result.merchant],['purchasedOn',result.purchasedOn],['grandTotal',result.grandTotal],['gas',result.gas],['groceryLines',result.groceryLines]];
        for(const [field,value] of reviewFields){await cx.execute('INSERT INTO receipt_review_issues(user_id,receipt_id,field_path,issue_type,proposed_value,status) VALUES (?,?,?,?,?,\'open\')',[job.userId,job.receiptId,field,'ocr_unverified',JSON.stringify(value)]);}
        await cx.execute('INSERT INTO audit_logs(user_id,entity_type,entity_id,action,after_data) VALUES (?,?,?,?,?)',[job.userId,'receipt',job.receiptId,'ocr_extracted',JSON.stringify({jobId:job.id,receiptType:result.receiptType,unverified:true})]);
        await cx.execute("UPDATE receipt_processing_jobs SET status='completed',completed_at=NOW(3),locked_at=NULL,last_error=NULL WHERE id=? AND user_id=? AND status='running'",[job.id,job.userId]);
        await cx.commit();
      }catch(err){await cx.rollback();throw err;}finally{cx.release();}
    },
    async fail(job){
      const cx=await pool.getConnection();try{await cx.beginTransaction();
        await cx.execute("UPDATE receipt_processing_jobs SET status='failed',locked_at=NULL,last_error='OCR processing failed; check worker logs' WHERE id=? AND user_id=? AND status='running'",[job.id,job.userId]);
        await cx.execute("UPDATE receipts SET processing_status='failed' WHERE user_id=? AND id=? AND processing_status='processing'",[job.userId,job.receiptId]);
        await cx.commit();
      }catch(err){await cx.rollback();throw err;}finally{cx.release();}
    },
    async close(){await pool.end();}
  };
}

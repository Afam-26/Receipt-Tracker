import { createPool, type Pool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { HttpError } from '../http/errors.js';
import type { ReceiptType, ReceiptImage } from './validation.js';

type Row=RowDataPacket & Record<string,unknown>;
export type FileMetadata={id:string;receiptId:string;originalFilename:string;mimeType:string;fileHash:string;byteSize:string;uploadedAt:string};
export type ReceiptMetadata={id:string;receiptType:ReceiptType;processingStatus:string;primaryFileHash:string|null;duplicateOfId:string|null;createdAt:string;files:FileMetadata[]};
export interface ReceiptStore {
  create(userId:string,receiptType:ReceiptType,filename:string,image:ReceiptImage,key:string):Promise<{receiptId:string;fileId:string;duplicateOfId:string|null}>;
  list(userId:string,limit:number,offset:number):Promise<ReceiptMetadata[]>;
  get(userId:string,receiptId:string):Promise<ReceiptMetadata|null>;
  file(userId:string,receiptId:string,fileId:string):Promise<{key:string;mimeType:string;filename:string}|null>;
  close():Promise<void>;
}
function mapFile(r:Row):FileMetadata{return {id:String(r.id),receiptId:String(r.receiptId),originalFilename:String(r.originalFilename),mimeType:String(r.mimeType),fileHash:String(r.fileHash),byteSize:String(r.byteSize),uploadedAt:String(r.uploadedAt)};}
function mapReceipt(r:Row,files:FileMetadata[]):ReceiptMetadata{return {id:String(r.id),receiptType:r.receiptType as ReceiptType,processingStatus:String(r.processingStatus),primaryFileHash:r.primaryFileHash===null?null:String(r.primaryFileHash),duplicateOfId:r.duplicateOfId===null?null:String(r.duplicateOfId),createdAt:String(r.createdAt),files};}
export function createReceiptStore(databaseUrl:string):ReceiptStore {
  const pool:Pool=createPool({uri:databaseUrl,connectionLimit:5,waitForConnections:true,timezone:'Z',dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});
  const selectReceipt='SELECT CAST(id AS CHAR) AS id, receipt_type AS receiptType, processing_status AS processingStatus, primary_file_hash AS primaryFileHash, CAST(duplicate_of_id AS CHAR) AS duplicateOfId, created_at AS createdAt FROM receipts WHERE user_id=?';
  async function readFiles(userId:string,receiptIds:string[]):Promise<Map<string,FileMetadata[]>> {
    const map=new Map<string,FileMetadata[]>();if(receiptIds.length===0)return map;
    const [rows]=await pool.query<Row[]>(`SELECT CAST(id AS CHAR) AS id,CAST(receipt_id AS CHAR) AS receiptId,original_filename AS originalFilename,mime_type AS mimeType,file_hash AS fileHash,CAST(byte_size AS CHAR) AS byteSize,uploaded_at AS uploadedAt FROM receipt_files WHERE user_id=? AND receipt_id IN (${receiptIds.map(()=>'?').join(',')}) ORDER BY id`,[userId,...receiptIds]);
    for(const row of rows){const f=mapFile(row);const list=map.get(f.receiptId)??[];list.push(f);map.set(f.receiptId,list);}
    return map;
  }
  return {
    async create(userId,receiptType,filename,image,key){
      const cx=await pool.getConnection();let transactionStarted=false;
      try{
        await cx.beginTransaction();transactionStarted=true;
        const [duplicates]=await cx.execute<Row[]>('SELECT CAST(id AS CHAR) AS id FROM receipts WHERE user_id=? AND primary_file_hash=? ORDER BY id LIMIT 1',[userId,image.sha256]);
        const duplicateOfId=duplicates[0]?String(duplicates[0].id):null;
        const [insert]=await cx.execute<ResultSetHeader>(`INSERT INTO receipts (user_id,receipt_type,processing_status,primary_file_hash,duplicate_of_id) VALUES (?,?,'uploaded',?,?)`,[userId,receiptType,image.sha256,duplicateOfId]);
        const receiptId=String(insert.insertId);
        const [file]=await cx.execute<ResultSetHeader>('INSERT INTO receipt_files (user_id,receipt_id,storage_key,original_filename,mime_type,file_hash,byte_size) VALUES (?,?,?,?,?,?,?)',[userId,receiptId,key,filename,image.mimeType,image.sha256,image.bytes.length]);
        await cx.execute('INSERT INTO audit_logs(user_id,entity_type,entity_id,action,after_data) VALUES (?,?,?,?,?)',[userId,'receipt',receiptId,'upload',JSON.stringify({fileId:String(file.insertId),fileHash:image.sha256,byteSize:image.bytes.length,receiptType})]);
        await cx.commit();transactionStarted=false;
        return {receiptId,fileId:String(file.insertId),duplicateOfId};
      }catch(error){if(transactionStarted)await cx.rollback();throw error;}finally{cx.release();}
    },
    async list(userId,limit,offset){
      const [rows]=await pool.execute<Row[]>(`${selectReceipt} ORDER BY id DESC LIMIT ? OFFSET ?`,[userId,limit,offset]);
      const ids=rows.map(r=>String(r.id));const files=await readFiles(userId,ids);
      return rows.map(r=>mapReceipt(r,files.get(String(r.id))??[]));
    },
    async get(userId,receiptId){
      const [rows]=await pool.execute<Row[]>(`${selectReceipt} AND id=? LIMIT 1`,[userId,receiptId]);
      if(!rows[0])return null;const files=await readFiles(userId,[receiptId]);
      return mapReceipt(rows[0],files.get(receiptId)??[]);
    },
    async file(userId,receiptId,fileId){
      const [rows]=await pool.execute<Row[]>('SELECT storage_key AS storageKey,mime_type AS mimeType,original_filename AS filename FROM receipt_files WHERE user_id=? AND receipt_id=? AND id=? LIMIT 1',[userId,receiptId,fileId]);
      if(!rows[0])return null;
      return {key:String(rows[0].storageKey),mimeType:String(rows[0].mimeType),filename:String(rows[0].filename)};
    },
    async close(){await pool.end();},
  };
}

import { createPool, type RowDataPacket, type PoolConnection, type ResultSetHeader } from 'mysql2/promise';
import { HttpError } from '../http/errors.js';
import { validateForConfirmation, type ReviewDraft } from './validation.js';

type Row=RowDataPacket & Record<string,unknown>;
type ReadResult={receiptId:string;status:string;extraction:{id:string;provider:string;data:unknown}|null;draft:ReviewDraft|null;revision:string|null};
export interface ReviewStore {
  get(userId:string,receiptId:string):Promise<ReadResult|null>;
  save(userId:string,receiptId:string,draft:ReviewDraft,expectedRevision:string|null):Promise<ReadResult>;
  confirm(userId:string,receiptId:string,expectedRevision:string):Promise<{receiptId:string;transactionId:string;purchaseId:string;receiptType:'grocery'|'gas';status:'confirmed'}>;
  close():Promise<void>;
}
function fail(status:number,code:string,message:string):never {throw new HttpError(status,code,message);}
function json(value:unknown):unknown {return typeof value==='string'?JSON.parse(value):value;}
async function fetchReview(cx:PoolConnection,userId:string,receiptId:string,lock=false):Promise<ReadResult|null> {
  const [receipts]=await cx.execute<Row[]>(`SELECT processing_status AS status FROM receipts WHERE user_id=? AND id=? ${lock?'FOR UPDATE':''}`,[userId,receiptId]);
  if(!receipts[0])return null;
  const [extractions]=await cx.execute<Row[]>('SELECT CAST(id AS CHAR) AS id,provider,raw_result AS rawResult FROM receipt_extractions WHERE user_id=? AND receipt_id=? ORDER BY id DESC LIMIT 1',[userId,receiptId]);
  const [draftRows]=await cx.execute<Row[]>("SELECT CAST(id AS CHAR) AS id,proposed_value AS proposedValue FROM receipt_review_issues WHERE user_id=? AND receipt_id=? AND field_path='phase3c.draft' ORDER BY id DESC LIMIT 1",[userId,receiptId]);
  const e=extractions[0],d=draftRows[0];
  return {receiptId,status:String(receipts[0].status),extraction:e?{id:String(e.id),provider:String(e.provider),data:json(e.rawResult)}:null,
    draft:d?json(d.proposedValue) as ReviewDraft:null,revision:d?String(d.id):null};
}
async function existsOwned(cx:PoolConnection,table:'merchants'|'product_variants',owner:string,id:string|null):Promise<boolean> {
  if(!id)return true;
  const [rows]=await cx.execute<Row[]>(`SELECT id FROM ${table} WHERE user_id=? AND id=? LIMIT 1`,[owner,id]);
  return !!rows[0];
}
export function createReviewStore(databaseUrl:string):ReviewStore {
  const pool=createPool({uri:databaseUrl,connectionLimit:5,waitForConnections:true,timezone:'Z',dateStrings:true,supportBigNumbers:true,bigNumberStrings:true});
  return {
    async get(owner,receiptId){const cx=await pool.getConnection();try{return await fetchReview(cx,owner,receiptId);}finally{cx.release();}},
    async save(owner,receiptId,draft,expectedRevision){
      const cx=await pool.getConnection();try{
        await cx.beginTransaction();const current=await fetchReview(cx,owner,receiptId,true);
        if(!current)fail(404,'RECEIPT_NOT_FOUND','Receipt not found');
        if(current.status!=='needs_review')fail(409,'RECEIPT_NOT_REVIEWABLE','Receipt must finish OCR before review');
        if(!current.extraction)fail(409,'EXTRACTION_REQUIRED','OCR extraction not found');
        if(current.extraction.id!==draft.extractionId)fail(409,'STALE_EXTRACTION','OCR extraction has changed');
        if(current.revision!==expectedRevision)fail(409,'STALE_REVIEW','Review was modified; reload before saving');
        const [insert]=await cx.execute<ResultSetHeader>("INSERT INTO receipt_review_issues(user_id,receipt_id,field_path,issue_type,proposed_value,status) VALUES (?,?,'phase3c.draft','user_review_draft',?,'open')",[owner,receiptId,JSON.stringify(draft)]);
        const newRevision=String(insert.insertId);
        await cx.execute('INSERT INTO audit_logs(user_id,entity_type,entity_id,action,before_data,after_data) VALUES (?,?,?,?,?,?)',[owner,'receipt',receiptId,'review_draft_saved',JSON.stringify({revision:current.revision}),JSON.stringify({revision:newRevision,receiptType:draft.receiptType})]);
        await cx.commit();return {...current,draft,revision:newRevision};
      }catch(err){await cx.rollback();throw err;}finally{cx.release();}
    },
    async confirm(owner,receiptId,expectedRevision){
      const cx=await pool.getConnection();try{
        await cx.beginTransaction();const current=await fetchReview(cx,owner,receiptId,true);
        if(!current)fail(404,'RECEIPT_NOT_FOUND','Receipt not found');
        if(current.status!=='needs_review')fail(409,'RECEIPT_NOT_REVIEWABLE','Receipt has already been finalized or is not ready');
        if(!current.extraction||!current.draft||!current.revision)fail(409,'REVIEW_REQUIRED','Save a reviewed draft before confirmation');
        if(current.revision!==expectedRevision)fail(409,'STALE_REVIEW','Review was modified; reload before confirming');
        if(current.draft.extractionId!==current.extraction.id)fail(409,'STALE_EXTRACTION','Extraction changed; reload and review');
        const parsed=validateForConfirmation(receiptId,current.draft);
        const [existing]=await cx.execute<Row[]>('SELECT id FROM purchase_transactions WHERE user_id=? AND receipt_id=? LIMIT 1 FOR UPDATE',[owner,receiptId]);
        if(existing.length)fail(409,'RECEIPT_ALREADY_LINKED','Receipt already linked to a transaction');
        if(!(await existsOwned(cx,'merchants',owner,current.draft.merchantId)))fail(404,'REFERENCE_NOT_FOUND','Merchant not found');
        if(parsed.kind==='grocery'){
          const v=parsed.value;
          for(const variant of new Set(v.items.map(i=>i.variantId).filter((x):x is string=>x!==null))){
            if(!(await existsOwned(cx,'product_variants',owner,variant)))fail(404,'REFERENCE_NOT_FOUND','Variant not found');
          }
          const [insert]=await cx.execute<ResultSetHeader>("INSERT INTO purchase_transactions(user_id,receipt_id,merchant_id,purchased_on,source_transaction_id,subtotal,tax_total,discount_total,grand_total,status,source_kind) VALUES (?,?,?,?,?,?,?,?,?,'confirmed','receipt')",
            [owner,receiptId,v.merchantId,v.purchasedOn,v.sourceTransactionId,v.subtotal,v.taxTotal,v.discountTotal,v.grandTotal]);
          const transactionId=String(insert.insertId);
          for(const item of v.items){
            await cx.execute("INSERT INTO grocery_line_items(user_id,transaction_id,variant_id,receipt_line_number,raw_description,quantity_purchased,measurement_unit,measured_amount,listed_unit_price,gross_line_total,net_line_total,review_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,'confirmed')",
              [owner,transactionId,item.variantId,item.receiptLineNumber,item.rawDescription,item.quantityPurchased,item.measurementUnit,item.measuredAmount,item.listedUnitPrice,item.grossLineTotal,item.netLineTotal]);
          }
          await cx.execute("UPDATE receipts SET processing_status='confirmed',receipt_type='grocery' WHERE user_id=? AND id=? AND processing_status='needs_review'",[owner,receiptId]);
          await cx.execute("UPDATE receipt_review_issues SET status='resolved',resolved_at=NOW(3) WHERE user_id=? AND receipt_id=? AND status='open'",[owner,receiptId]);
          await cx.execute('INSERT INTO audit_logs(user_id,entity_type,entity_id,action,before_data,after_data) VALUES (?,?,?,?,?,?)',[owner,'receipt',receiptId,'review_confirmed',JSON.stringify({revision:current.revision,extractionId:current.extraction.id}),JSON.stringify({transactionId,receiptType:'grocery',confirmedLines:v.items.length})]);
          await cx.commit();return {receiptId,transactionId,purchaseId:transactionId,receiptType:'grocery',status:'confirmed'};
        }
        const v=parsed.value;
        const [grades]=await cx.execute<Row[]>('SELECT id FROM fuel_grades WHERE id=? LIMIT 1',[v.fuelGradeId]);
        if(!grades.length)fail(404,'REFERENCE_NOT_FOUND','Fuel grade not found');
        const [t]=await cx.execute<ResultSetHeader>("INSERT INTO purchase_transactions(user_id,receipt_id,merchant_id,purchased_on,source_transaction_id,grand_total,status,source_kind) VALUES (?,?,?,?,?,?,'confirmed','receipt')",
          [owner,receiptId,v.merchantId,v.purchasedOn,v.sourceTransactionId,v.totalPaid]);
        const transactionId=String(t.insertId);
        const [g]=await cx.execute<ResultSetHeader>("INSERT INTO gas_purchases(user_id,transaction_id,fuel_grade_id,raw_fuel_grade,regular_price_per_gallon,reward_discount_per_gallon,paid_price_per_gallon,gallons,total_paid,price_source,review_status) VALUES (?,?,?,?,?,?,?,?,?,?,'confirmed')",
          [owner,transactionId,v.fuelGradeId,v.rawFuelGrade,v.regularPricePerGallon,v.rewardDiscountPerGallon,v.paidPricePerGallon,v.gallons,v.totalPaid,v.priceSource]);
        await cx.execute("UPDATE receipts SET processing_status='confirmed',receipt_type='gas' WHERE user_id=? AND id=? AND processing_status='needs_review'",[owner,receiptId]);
        await cx.execute("UPDATE receipt_review_issues SET status='resolved',resolved_at=NOW(3) WHERE user_id=? AND receipt_id=? AND status='open'",[owner,receiptId]);
        await cx.execute('INSERT INTO audit_logs(user_id,entity_type,entity_id,action,before_data,after_data) VALUES (?,?,?,?,?,?)',[owner,'receipt',receiptId,'review_confirmed',JSON.stringify({revision:current.revision,extractionId:current.extraction.id}),JSON.stringify({transactionId,gasPurchaseId:String(g.insertId),receiptType:'gas'})]);
        await cx.commit();return {receiptId,transactionId,purchaseId:String(g.insertId),receiptType:'gas',status:'confirmed'};
      }catch(err){await cx.rollback();if(typeof err==='object'&&err!==null&&'code'in err&&err.code==='ER_DUP_ENTRY')fail(409,'DUPLICATE_TRANSACTION','Receipt already confirmed');throw err;}finally{cx.release();}
    },
    async close(){await pool.end();}
  };
}

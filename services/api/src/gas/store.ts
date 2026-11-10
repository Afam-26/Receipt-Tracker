import { createPool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { HttpError } from '../http/errors.js';
import { getRankings, latestImpact, orderHistory, type PriceObservation, type Assumptions } from './calculations.js';
import type { parseGasPurchase, parseGasFilters, parseRankFilters, parseAssumptions } from './validation.js';

type PurchaseInput = ReturnType<typeof parseGasPurchase>;
type Filters = ReturnType<typeof parseGasFilters>;
type RankFilters = ReturnType<typeof parseRankFilters>;
type Row = RowDataPacket & Record<string, any>;
export interface GasStore {
  grades(): Promise<unknown[]>;
  list(userId:string, filters:Filters):Promise<unknown[]>;
  get(userId:string, gasId:string):Promise<unknown|null>;
  create(userId:string, input:PurchaseInput):Promise<{id:string;transactionId:string}>;
  update(userId:string, gasId:string, input:PurchaseInput):Promise<{id:string}>;
  history(userId:string, filters:Filters):Promise<unknown[]>;
  rankings(userId:string, filters:RankFilters):Promise<unknown[]>;
  impact(userId:string):Promise<unknown>;
  settings(userId:string):Promise<Assumptions|null>;
  updateSettings(userId:string, input:ReturnType<typeof parseAssumptions>):Promise<Assumptions>;
  close():Promise<void>;
}
function databaseError(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ER_DUP_ENTRY') {
    throw new HttpError(409,'DUPLICATE_TRANSACTION','This transaction key was already saved');
  }
  throw error;
}
export function createGasStore(databaseUrl:string):GasStore {
  const pool=createPool({uri:databaseUrl,connectionLimit:6,waitForConnections:true,timezone:'Z',decimalNumbers:false,
    supportBigNumbers:true,bigNumberStrings:true,dateStrings:true});
  async function exists(cx: PoolConnection, table:'merchants'|'receipts', userId:string, id:string|null) {
    if (!id) return true;
    const [rows]=await cx.execute<Row[]>(`SELECT id FROM ${table} WHERE user_id=? AND id=? LIMIT 1`,[userId,id]);
    return rows.length===1;
  }
  async function gradeExists(cx: PoolConnection, gradeId:string|null) {
    if (!gradeId) return true;
    const [rows]=await cx.execute<Row[]>('SELECT id FROM fuel_grades WHERE id=? LIMIT 1',[gradeId]);
    return rows.length===1;
  }
  async function validateRefs(cx: PoolConnection, userId:string, v:PurchaseInput) {
    if (!(await exists(cx,'merchants',userId,v.merchantId))) throw new HttpError(404,'MERCHANT_NOT_FOUND','Merchant not found');
    if (!(await exists(cx,'receipts',userId,v.receiptId))) throw new HttpError(404,'RECEIPT_NOT_FOUND','Receipt not found');
    if (!(await gradeExists(cx,v.fuelGradeId))) throw new HttpError(404,'FUEL_GRADE_NOT_FOUND','Fuel grade not found');
  }
  async function selectObservations(userId:string, f?:Filters):Promise<PriceObservation[]> {
    const conditions=["g.user_id=?","g.review_status='confirmed'","t.status='confirmed'","g.fuel_grade_id IS NOT NULL","g.regular_price_per_gallon IS NOT NULL","t.purchased_on IS NOT NULL", "g.price_source <> 'unknown'"];
    const args:Array<string|number>=[userId];
    if (f?.from) {conditions.push('t.purchased_on>=?');args.push(f.from);}
    if (f?.to) {conditions.push('t.purchased_on<=?');args.push(f.to);}
    if (f?.fuelGradeId){conditions.push('g.fuel_grade_id=?');args.push(f.fuelGradeId);}
    if (f?.merchantId){conditions.push('t.merchant_id=?');args.push(f.merchantId);}
    const [rows]=await pool.execute<Row[]>(`SELECT g.id,g.transaction_id AS transactionId, DATE_FORMAT(t.purchased_on,'%Y-%m-%d') AS purchasedOn, CAST(g.fuel_grade_id AS CHAR) AS fuelGradeId, g.regular_price_per_gallon AS regularPricePerGallon,g.reward_discount_per_gallon AS rewardDiscountPerGallon,g.paid_price_per_gallon AS paidPricePerGallon,g.gallons,g.total_paid AS totalPaid,CAST(t.merchant_id AS CHAR) AS merchantId,CAST(t.receipt_id AS CHAR) AS receiptId,g.raw_fuel_grade AS rawFuelGrade,g.price_source AS priceSource FROM gas_purchases g JOIN purchase_transactions t ON t.user_id=g.user_id AND t.id=g.transaction_id WHERE ${conditions.join(' AND ')} ORDER BY t.purchased_on ASC,t.id ASC,g.id ASC`,args);
    return rows.map(row=>({ id:String(row.id), transactionId:String(row.transactionId), purchasedOn:String(row.purchasedOn), fuelGradeId:String(row.fuelGradeId),regularPricePerGallon:String(row.regularPricePerGallon),
      rewardDiscountPerGallon:row.rewardDiscountPerGallon===null?null:String(row.rewardDiscountPerGallon), paidPricePerGallon:row.paidPricePerGallon===null?null:String(row.paidPricePerGallon),
      gallons:row.gallons===null?null:String(row.gallons),totalPaid:row.totalPaid===null?null:String(row.totalPaid), merchantId:row.merchantId??null,receiptId:row.receiptId??null,rawFuelGrade:row.rawFuelGrade??null,priceSource:row.priceSource })) as PriceObservation[];
  }
  async function userAssumptions(userId:string):Promise<Assumptions|null> {
    const [rows]=await pool.execute<Row[]>('SELECT gallons_per_fillup AS gallonsPerFillup,fillups_per_week AS fillsPerWeek FROM user_settings WHERE user_id=? LIMIT 1',[userId]);
    const r=rows[0];return r?{gallonsPerFillup:String(r.gallonsPerFillup),fillsPerWeek:String(r.fillsPerWeek)}:null;
  }
  return {
    async grades() {
      const [rows]=await pool.execute<Row[]>('SELECT id,canonical_name AS canonicalName,grade_group AS gradeGroup,octane_rating AS octaneRating,fuel_type AS fuelType FROM fuel_grades ORDER BY grade_group,octane_rating,id');
      return rows;
    },
    async list(userId,f) {
      const conditions=['g.user_id=?']; const args:Array<string|number>=[userId];
      if(f.from){conditions.push('t.purchased_on>=?');args.push(f.from);}
      if(f.to){conditions.push('t.purchased_on<=?');args.push(f.to);}
      if(f.merchantId){conditions.push('t.merchant_id=?');args.push(f.merchantId);}
      if(f.fuelGradeId){conditions.push('g.fuel_grade_id=?');args.push(f.fuelGradeId);}
      const [rows]=await pool.execute<Row[]>(`SELECT g.id,g.transaction_id AS transactionId,g.fuel_grade_id AS fuelGradeId,g.raw_fuel_grade AS rawFuelGrade,g.regular_price_per_gallon AS regularPricePerGallon,g.reward_discount_per_gallon AS rewardDiscountPerGallon,g.paid_price_per_gallon AS paidPricePerGallon,g.gallons,g.total_paid AS totalPaid,g.price_source AS priceSource,g.review_status AS reviewStatus,t.purchased_on AS purchasedOn,t.merchant_id AS merchantId,t.receipt_id AS receiptId,t.status,t.source_transaction_id AS sourceTransactionId FROM gas_purchases g JOIN purchase_transactions t ON t.id=g.transaction_id AND t.user_id=g.user_id WHERE ${conditions.join(' AND ')} ORDER BY t.purchased_on DESC,t.id DESC,g.id DESC LIMIT ? OFFSET ?`,[...args,f.limit,f.offset]);
      return rows;
    },
    async get(userId,id){
      const [rows]=await pool.execute<Row[]>('SELECT g.*,t.purchased_on AS purchasedOn,t.merchant_id AS merchantId,t.receipt_id AS receiptId,t.status,t.source_transaction_id AS sourceTransactionId FROM gas_purchases g JOIN purchase_transactions t ON t.id=g.transaction_id AND t.user_id=g.user_id WHERE g.user_id=? AND g.id=? LIMIT 1',[userId,id]);
      return rows[0]??null;
    },
    async create(userId,v){
      const cx=await pool.getConnection();
      try {await cx.beginTransaction();await validateRefs(cx,userId,v);
        const [t]=await cx.execute<ResultSetHeader>(`INSERT INTO purchase_transactions (user_id,receipt_id,merchant_id,purchased_on,source_transaction_id,grand_total,status,source_kind) VALUES (?,?,?,?,?,?,?,'manual')`,[userId,v.receiptId,v.merchantId,v.purchasedOn,v.sourceTransactionId,v.totalPaid,v.status]);
        const transactionId=String(t.insertId);
        const [g]=await cx.execute<ResultSetHeader>(`INSERT INTO gas_purchases (user_id,transaction_id,fuel_grade_id,raw_fuel_grade,regular_price_per_gallon,reward_discount_per_gallon,paid_price_per_gallon,gallons,total_paid,price_source,review_status) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[userId,transactionId,v.fuelGradeId,v.rawFuelGrade,v.regularPricePerGallon,v.rewardDiscountPerGallon,v.paidPricePerGallon,v.gallons,v.totalPaid,v.priceSource,v.status==='confirmed'?'confirmed':'needs_review']);
        await cx.commit();return {id:String(g.insertId),transactionId};
      }catch(err){await cx.rollback();databaseError(err);}finally{cx.release();}
    },
    async update(userId,gasId,v){
      const cx=await pool.getConnection();
      try{await cx.beginTransaction();
        const [rows]=await cx.execute<Row[]>(`SELECT g.*,t.status,t.source_transaction_id AS sourceTransactionId,t.id AS transactionId FROM gas_purchases g JOIN purchase_transactions t ON t.id=g.transaction_id AND t.user_id=g.user_id WHERE g.id=? AND g.user_id=? FOR UPDATE`,[gasId,userId]);
        const current=rows[0];if(!current)throw new HttpError(404,'GAS_PURCHASE_NOT_FOUND','Gas purchase not found');
        if(current.status==='confirmed'||current.status==='refunded'||current.status==='voided')throw new HttpError(409,'IMMUTABLE_PURCHASE','Confirmed or finalized gas purchases require the correction workflow');
        if(current.sourceTransactionId!==v.sourceTransactionId) throw new HttpError(400,'IMMUTABLE_KEY','sourceTransactionId may not change');
        await validateRefs(cx,userId,v);
        await cx.execute(`UPDATE purchase_transactions SET receipt_id=?,merchant_id=?,purchased_on=?,grand_total=?,status=? WHERE id=? AND user_id=?`,[v.receiptId,v.merchantId,v.purchasedOn,v.totalPaid,v.status,current.transactionId,userId]);
        await cx.execute(`UPDATE gas_purchases SET fuel_grade_id=?,raw_fuel_grade=?,regular_price_per_gallon=?,reward_discount_per_gallon=?,paid_price_per_gallon=?,gallons=?,total_paid=?,price_source=?,review_status=? WHERE id=? AND user_id=?`,[v.fuelGradeId,v.rawFuelGrade,v.regularPricePerGallon,v.rewardDiscountPerGallon,v.paidPricePerGallon,v.gallons,v.totalPaid,v.priceSource,v.status==='confirmed'?'confirmed':'needs_review',gasId,userId]);
        await cx.execute('INSERT INTO audit_logs(user_id,entity_type,entity_id,action,before_data,after_data) VALUES (?,?,?, ?,?,?)',[userId,'gas_purchase',gasId,'update',JSON.stringify(current),JSON.stringify(v)]);
        await cx.commit();return {id:gasId};
      }catch(err){await cx.rollback();databaseError(err);}finally{cx.release();}
    },
    async history(userId,f){return orderHistory((await selectObservations(userId,f)).slice(f.offset,f.offset+f.limit));},
    async rankings(userId,f){const s=await userAssumptions(userId);if(!s)throw new HttpError(404,'SETTINGS_NOT_FOUND','Settings not found');const rows=await selectObservations(userId,f);return getRankings(rows,s,f.mode).slice(f.offset,f.offset+f.limit);},
    async impact(userId){const s=await userAssumptions(userId);if(!s)throw new HttpError(404,'SETTINGS_NOT_FOUND','Settings not found');return {assumptions:s,liveAnnualCostImpact:latestImpact(await selectObservations(userId),s)};},
    async settings(userId){return userAssumptions(userId);},
    async updateSettings(userId,v){const [result]=await pool.execute<ResultSetHeader>('UPDATE user_settings SET gallons_per_fillup=?,fills_per_week=? WHERE user_id=?',[v.gallonsPerFillup,v.fillsPerWeek,userId]);if(result.affectedRows!==1)throw new HttpError(404,'SETTINGS_NOT_FOUND','Settings not found');return v;},
    async close(){await pool.end();}
  };
}

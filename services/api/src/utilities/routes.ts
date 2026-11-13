import { Router, type Request } from 'express';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { filters, parseBill, parseId, parseRevision, UtilityError, type BillInput } from './validation.js';

/** Mount AFTER your existing Clerk auth + local-account sync middleware. No caller-supplied user IDs. */
export function createUtilityRouter(deps: {pool:Pool; ownerId:(req:Request)=>string|number|null|undefined}){
  const router=Router();
  const owner=(req:Request):string=>{
    const id=deps.ownerId(req);
    if((typeof id!=='string'&&typeof id!=='number')||! /^[1-9]\d{0,18}$/.test(String(id)))
      throw new UtilityError(401,'AUTH_REQUIRED','A verified local account is required');
    return String(id);
  };
  const respond=(fn:(req:Request,res:any)=>Promise<void>)=>async(req:Request,res:any)=>{
    try {await fn(req,res);}catch(e){
      if(e instanceof UtilityError){res.status(e.status).json({ok:false,error:{code:e.code,message:e.message}});return;}
      console.error('Utility API error',{method:req.method,path:req.path,error:e});
      res.status(500).json({ok:false,error:{code:'UTILITY_UNAVAILABLE',message:'Utility service is temporarily unavailable'}});
    }
  };
  const columns=`id, user_id AS userId, category, provider_name AS providerName,
    account_label AS accountLabel, DATE_FORMAT(service_start,'%Y-%m-%d') AS serviceStart,
    DATE_FORMAT(service_end,'%Y-%m-%d') AS serviceEnd,
    DATE_FORMAT(due_date,'%Y-%m-%d') AS dueDate,
    currency_code AS currencyCode, usage_amount AS usageAmount, usage_unit AS usageUnit,
    rate_per_unit AS ratePerUnit, base_charge AS baseCharge, taxes_fees AS taxesFees,
    total_amount AS totalAmount, notes, source_receipt_id AS sourceReceiptId,
    status, revision, confirmed_at AS confirmedAt, created_at AS createdAt`;
  const read=async(conn:Pool|PoolConnection,userId:string,id:string,lock=false)=>{
    const [rows]=await conn.query<RowDataPacket[]>(`SELECT ${columns} FROM utility_bills WHERE user_id=? AND id=?${lock?' FOR UPDATE':''}`,[userId,id]);
    return rows[0]??null;
  };
  router.get('/bills',respond(async(req,res)=>{
    const uid=owner(req),f=filters(req.query as Record<string,unknown>);
    const parts=['user_id=?'],params:any[]=[uid];
    if(f.category){parts.push('category=?');params.push(f.category);}
    if(f.from){parts.push('service_end>=?');params.push(f.from);}
    if(f.to){parts.push('service_start<=?');params.push(f.to);}
    const [rows]=await deps.pool.query<RowDataPacket[]>(`SELECT ${columns} FROM utility_bills WHERE ${parts.join(' AND ')} ORDER BY service_end DESC,id DESC LIMIT ?`,[...params,f.limit]);
    res.json({ok:true,data:{items:rows}});
  }));
  router.get('/bills/export.csv',respond(async(req,res)=>{
    const uid=owner(req),f=filters(req.query as Record<string,unknown>);
    const parts=['user_id=?'],params:any[]=[uid];
    if(f.category){parts.push('category=?');params.push(f.category);}
    if(f.from){parts.push('service_end>=?');params.push(f.from);}
    if(f.to){parts.push('service_start<=?');params.push(f.to);}
    const [rows]=await deps.pool.query<RowDataPacket[]>(`SELECT ${columns} FROM utility_bills WHERE ${parts.join(' AND ')} ORDER BY service_end DESC,id DESC LIMIT ?`,[...params,f.limit]);
    const keys=['id','category','providerName','serviceStart','serviceEnd','dueDate','usageAmount','usageUnit','ratePerUnit','baseCharge','taxesFees','totalAmount','status'];
    const csv=(x:unknown)=>{const s=String(x??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
    res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="utility-bills.csv"');
    res.send([keys.join(','),...rows.map(row=>keys.map(k=>csv(row[k])).join(','))].join('\r\n'));
  }));
  router.get('/bills/:id',respond(async(req,res)=>{
    const bill=await read(deps.pool,owner(req),parseId(String(req.params.id)));
    if(!bill)throw new UtilityError(404,'UTILITY_NOT_FOUND','Bill not found');
    res.json({ok:true,data:bill});
  }));
  router.post('/bills',respond(async(req,res)=>{
    const uid=owner(req),d=parseBill(req.body);
    try{
      // SOURCE_LINK_STAGE3: never trust a supplied source ID without verifying both ownership and type.
      // The composite foreign key and unique index also protect against races and duplicate links.
      if(d.sourceReceiptId){
        const [matches]=await deps.pool.execute<RowDataPacket[]>(
          "SELECT id FROM receipts WHERE user_id=? AND id=? AND receipt_type='utility' LIMIT 1",
          [uid,d.sourceReceiptId]);
        if(matches.length!==1)throw new UtilityError(404,'UTILITY_SOURCE_NOT_FOUND','Utility statement not found');
      }
      const [result]=d.sourceReceiptId
        ?await deps.pool.execute<ResultSetHeader>(`INSERT INTO utility_bills
          (user_id,idempotency_key,category,provider_name,account_label,service_start,service_end,due_date,
            usage_amount,usage_unit,rate_per_unit,base_charge,taxes_fees,total_amount,notes,source_receipt_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[uid,...values(d),d.sourceReceiptId])
        :await deps.pool.execute<ResultSetHeader>(`INSERT INTO utility_bills
          (user_id,idempotency_key,category,provider_name,account_label,service_start,service_end,due_date,
            usage_amount,usage_unit,rate_per_unit,base_charge,taxes_fees,total_amount,notes)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[uid,...values(d)]);
      res.status(201).json({ok:true,data:await read(deps.pool,uid,String(result.insertId))});
    }catch(e:any){if(e?.code==='ER_DUP_ENTRY')throw new UtilityError(409,'DUPLICATE_UTILITY_BILL','This bill or linked statement was already recorded');throw e;}
  }));
  router.put('/bills/:id',respond(async(req,res)=>{
    const uid=owner(req),id=parseId(String(req.params.id)),rev=parseRevision(req.body?.expectedRevision);
    const {expectedRevision:ignored,...fields}=req.body??{};
    if(fields.sourceReceiptId!==undefined)throw new UtilityError(400,'SOURCE_LINK_IMMUTABLE','The source statement cannot be changed on a saved bill');
    const d=parseBill(fields);
    const [r]=await deps.pool.execute<ResultSetHeader>(`UPDATE utility_bills SET
      category=?,provider_name=?,account_label=?,service_start=?,service_end=?,due_date=?,
      usage_amount=?,usage_unit=?,rate_per_unit=?,base_charge=?,taxes_fees=?,total_amount=?,notes=?,revision=revision+1
      WHERE user_id=? AND id=? AND revision=? AND status='draft' AND idempotency_key=?`,
      [...values(d).slice(1),uid,id,rev,d.idempotencyKey]);
    if(r.affectedRows!==1){const current=await read(deps.pool,uid,id);
      if(!current)throw new UtilityError(404,'UTILITY_NOT_FOUND','Bill not found');
      throw new UtilityError(409,'STALE_OR_CONFIRMED','Bill was changed or is already confirmed');}
    res.json({ok:true,data:await read(deps.pool,uid,id)});
  }));
  router.post('/bills/:id/confirm',respond(async(req,res)=>{
    const uid=owner(req),id=parseId(String(req.params.id));
    if(req.body?.acknowledged!==true)throw new UtilityError(400,'ACK_REQUIRED','Review and explicitly acknowledge the utility bill');
    const rev=parseRevision(req.body?.expectedRevision);
    const conn=await deps.pool.getConnection();
    try{
      await conn.beginTransaction();const bill=await read(conn,uid,id,true);
      if(!bill)throw new UtilityError(404,'UTILITY_NOT_FOUND','Bill not found');
      if(bill.status!=='draft'||Number(bill.revision)!==rev)throw new UtilityError(409,'STALE_OR_CONFIRMED','Bill was changed or already confirmed');
      if(bill.totalAmount===null)throw new UtilityError(400,'INCOMPLETE_BILL','Enter the verified bill total before confirming');
      await conn.execute(`UPDATE utility_bills SET status='confirmed',confirmed_at=CURRENT_TIMESTAMP(3),revision=revision+1 WHERE user_id=? AND id=? AND status='draft' AND revision=?`,[uid,id,rev]);
      await conn.commit();res.status(201).json({ok:true,data:await read(deps.pool,uid,id)});
    }catch(e){await conn.rollback();throw e;}finally{conn.release();}
  }));
  router.get('/summary',respond(async(req,res)=>{
    const uid=owner(req),f=filters(req.query as Record<string,unknown>);
    const cond=['user_id=?',"status='confirmed'"],args:any[]=[uid];
    if(f.category){cond.push('category=?');args.push(f.category);}
    if(f.from){cond.push('service_end>=?');args.push(f.from);}
    if(f.to){cond.push('service_start<=?');args.push(f.to);}
    const [rows]=await deps.pool.query<RowDataPacket[]>(`SELECT category, COUNT(*) AS billCount,
      CAST(SUM(total_amount) AS CHAR) AS totalAmount,
      CAST(AVG(total_amount) AS CHAR) AS averageAmount,
      CAST(MIN(total_amount) AS CHAR) AS lowestAmount,
      CAST(MAX(total_amount) AS CHAR) AS highestAmount
      FROM utility_bills WHERE ${cond.join(' AND ')} AND total_amount IS NOT NULL GROUP BY category ORDER BY category`,args);
    res.json({ok:true,data:{groups:rows}});
  }));
  router.get('/rankings',respond(async(req,res)=>{
    const uid=owner(req),f=filters(req.query as Record<string,unknown>);
    const cond=['user_id=?',"status='confirmed'",'total_amount IS NOT NULL'],args:any[]=[uid];
    if(f.category){cond.push('category=?');args.push(f.category);}
    if(f.from){cond.push('service_end>=?');args.push(f.from);}
    if(f.to){cond.push('service_start<=?');args.push(f.to);}
    const [rows]=await deps.pool.query<RowDataPacket[]>(`SELECT category,provider_name AS providerName,
      DATE_FORMAT(service_end,'%Y-%m-%d') AS serviceEnd, total_amount AS totalAmount,
      usage_amount AS usageAmount, usage_unit AS usageUnit,rate_per_unit AS ratePerUnit
      FROM utility_bills WHERE ${cond.join(' AND ')} ORDER BY category,provider_name,service_end,id LIMIT 5000`,args);
    const groups=new Map<string,any[]>();for(const row of rows){const key=JSON.stringify([row.category,row.providerName.toLowerCase()]);const arr=groups.get(key)??[];arr.push(row);groups.set(key,arr);}
    const rankings:any[]=[];
    for(const arr of groups.values()){
      for(let i=1;i<arr.length;i++){
        const prior=arr[i-1],now=arr[i];const before=Number(prior.totalAmount),after=Number(now.totalAmount);
        if(before<=0||after<=before)continue;
        const delta=after-before;
        const sameUnit=now.usageUnit&&prior.usageUnit===now.usageUnit&&now.usageAmount!==null&&prior.usageAmount!==null;
        rankings.push({category:now.category,providerName:now.providerName,earlierDate:prior.serviceEnd,laterDate:now.serviceEnd,
          earlierAmount:prior.totalAmount,laterAmount:now.totalAmount,increaseAmount:delta.toFixed(2),
          increasePercent:Number((delta/before*100).toFixed(1)),
          earlierUsage:prior.usageAmount,laterUsage:now.usageAmount,usageUnit:sameUnit?now.usageUnit:null,
          earlierRate:prior.ratePerUnit,laterRate:now.ratePerUnit,
          note:'Total bill changes may reflect usage, fees or rates; do not treat total changes as rate increases.'});
      }
    }
    rankings.sort((a,b)=>b.increasePercent-a.increasePercent||b.increaseAmount-a.increaseAmount);
    res.json({ok:true,data:{items:rankings.slice(0,f.limit)}});
  }));
  return router;
}
function values(d:BillInput){return [d.idempotencyKey,d.category,d.providerName,d.accountLabel,d.serviceStart,d.serviceEnd,d.dueDate,d.usageAmount,d.usageUnit,d.ratePerUnit,d.baseCharge,d.taxesFees,d.totalAmount,d.notes];}

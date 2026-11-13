import type { Express, RequestHandler } from 'express';
import { createPool, type RowDataPacket } from 'mysql2/promise';
import type { AuthServices } from '../auth/types.js';
import { createRequireUser, type AuthRequest } from '../auth/routes.js';
import { HttpError } from '../http/errors.js';

type Row = RowDataPacket & Record<string, unknown>;
export interface GroceryDashboardStore {
  dashboard(userId: string, query: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}
function positiveId(value: unknown, name: string): string | null {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 18446744073709551615n)
    throw new HttpError(400, 'INVALID_FILTER', `Invalid ${name}`);
  return value;
}
function date(value: unknown, name: string): string | null {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, 'INVALID_FILTER', `Invalid ${name}`);
  const d = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== value) throw new HttpError(400, 'INVALID_FILTER', `Invalid ${name}`);
  return value;
}
function numberValue(v:unknown):number|null {
  if(v===null || v===undefined || v==='')return null;
  const n=Number(v);return Number.isFinite(n)?n:null;
}
export function createGroceryDashboardStore(databaseUrl:string):GroceryDashboardStore {
  const pool=createPool({uri:databaseUrl,connectionLimit:3,waitForConnections:true,timezone:'Z',decimalNumbers:false,dateStrings:true});
  return {
    async dashboard(userId, q){
      const categoryId=positiveId(q.categoryId,'categoryId'),productId=positiveId(q.productId,'productId');
      const from=date(q.from,'from'),to=date(q.to,'to');
      if(from&&to&&from>to)throw new HttpError(400,'INVALID_FILTER','From date must not exceed to date');
      const where=["i.user_id=?","t.status='confirmed'","i.review_status='confirmed'","t.purchased_on IS NOT NULL","i.net_line_total IS NOT NULL","i.quantity_purchased > 0"];
      const params:Array<string|number>=[userId];
      if(categoryId){where.push('p.category_id=?');params.push(categoryId);}
      if(productId){where.push('p.id=?');params.push(productId);}
      if(from){where.push('t.purchased_on>=?');params.push(from);}
      if(to){where.push('t.purchased_on<=?');params.push(to);}
      // This bounded result is intentional. It cannot silently claim to rank an entire large catalog.
      const [rows]=await pool.execute<Row[]>(`SELECT CAST(i.id AS CHAR) AS lineId, DATE_FORMAT(t.purchased_on,'%Y-%m-%d') AS purchasedOn,
        CAST(p.id AS CHAR) AS productId,p.canonical_name AS productName,CAST(p.category_id AS CHAR) AS categoryId,
        CAST(v.id AS CHAR) AS variantId,v.variant_name AS variantName,v.package_quantity AS packageQuantity,v.package_unit AS packageUnit,
        i.quantity_purchased AS quantity,i.net_line_total AS netTotal
        FROM grocery_line_items i
        JOIN purchase_transactions t ON t.id=i.transaction_id AND t.user_id=i.user_id
        JOIN product_variants v ON v.id=i.variant_id AND v.user_id=i.user_id
        JOIN products p ON p.id=v.product_id AND p.user_id=v.user_id
        WHERE ${where.join(' AND ')}
        ORDER BY t.purchased_on ASC,t.id ASC,i.id ASC LIMIT 5001`,params);
      const truncated=rows.length>5000;
      const observations=rows.slice(0,5000).flatMap(r=>{
        const qty=numberValue(r.quantity),net=numberValue(r.netTotal);
        if(qty===null||qty<=0||net===null||net<0)return [];
        return [{id:String(r.lineId),date:String(r.purchasedOn),productId:String(r.productId),productName:String(r.productName),
          variantId:String(r.variantId),variantName:String(r.variantName),packageQuantity:r.packageQuantity==null?null:String(r.packageQuantity),
          packageUnit:r.packageUnit==null?null:String(r.packageUnit),price:Math.round(net/qty*10000)/10000}];
      });
      const grouped=new Map<string,typeof observations>();
      for(const o of observations){const g=grouped.get(o.variantId)??[];g.push(o);grouped.set(o.variantId,g);}
      const rankings=[...grouped.values()].filter(g=>g.length>=2).map(g=>{
        const first=g[0],last=g[g.length-1],change=Math.round((last.price-first.price)*10000)/10000;
        return {variantId:first.variantId,productId:first.productId,productName:first.productName,variantName:first.variantName,
          packageQuantity:first.packageQuantity,packageUnit:first.packageUnit,firstDate:first.date,lastDate:last.date,
          firstPrice:first.price,lastPrice:last.price,change,percent:first.price>0?Math.round(change/first.price*10000)/100:null,samples:g.length};
      }).filter(r=>r.change>0).sort((a,b)=>(b.percent??-Infinity)-(a.percent??-Infinity));
      const prices=observations.map(o=>o.price);
      return {observations,rankings,summary:{count:observations.length,min:prices.length?Math.min(...prices):null,
        max:prices.length?Math.max(...prices):null,average:prices.length?Math.round(prices.reduce((a,b)=>a+b,0)/prices.length*100)/100:null},
        truncated,note:'Only confirmed grocery lines with known quantities. Prices are per purchased item; rankings compare the same exact variant and package.'};
    },
    async close(){await pool.end();}
  };
}
export function registerGroceryDashboardRoutes(app:Express, auth:AuthServices, store:GroceryDashboardStore):void {
  const guard=createRequireUser(auth);
  const handler:RequestHandler=async(req,res)=>{
    const user=(req as AuthRequest).authenticatedUser;
    if(!user)throw new HttpError(401,'AUTH_REQUIRED','Authentication required');
    const result=await store.dashboard(user.id,req.query);
    res.json({ok:true,data:result});
  };
  app.get('/api/grocery/dashboard',guard,handler);
}

import {createPool,type RowDataPacket} from 'mysql2/promise';
import type {GroceryObservation} from './calculations.js';
import type {GroceryAnalyticsFilter} from './validation.js';
export interface AnalyticsStore {
  grocery(userId:string, filters:GroceryAnalyticsFilter):Promise<GroceryObservation[]|null>;
  close():Promise<void>;
}
type Row=RowDataPacket & Record<string,unknown>;
export function createAnalyticsStore(databaseUrl:string):AnalyticsStore {
  const pool=createPool({uri:databaseUrl,connectionLimit:5,waitForConnections:true,timezone:'Z',decimalNumbers:false,supportBigNumbers:true,bigNumberStrings:true,dateStrings:true});
  return {
    async grocery(userId,f){
      const [found]=await pool.execute<Row[]>('SELECT id FROM products WHERE user_id=? AND id=? LIMIT 1',[userId,f.productId]);
      if(found.length===0)return null;
      const where=["i.user_id=?","p.id=?","i.review_status='confirmed'","t.status='confirmed'","t.purchased_on IS NOT NULL","i.net_line_total IS NOT NULL","i.quantity_purchased > 0"];
      const args:Array<string|number>=[userId,f.productId];
      if(f.variantId){where.push('v.id=?');args.push(f.variantId);}
      if(f.merchantId){where.push('t.merchant_id=?');args.push(f.merchantId);}
      if(f.from){where.push('t.purchased_on>=?');args.push(f.from);}
      if(f.to){where.push('t.purchased_on<=?');args.push(f.to);}
      const [rows]=await pool.execute<Row[]>(`SELECT CAST(i.id AS CHAR) AS lineItemId,CAST(t.id AS CHAR) AS transactionId,DATE_FORMAT(t.purchased_on,'%Y-%m-%d') AS purchasedOn,CAST(p.id AS CHAR) AS productId,CAST(v.id AS CHAR) AS variantId,v.variant_name AS variantName,CAST(t.merchant_id AS CHAR) AS merchantId,m.name AS merchantName,i.quantity_purchased AS quantityPurchased,i.net_line_total AS netLineTotal,v.package_quantity AS packageQuantity,v.package_unit AS packageUnit,v.unit_count AS unitCount
      FROM grocery_line_items i
      JOIN purchase_transactions t ON t.user_id=i.user_id AND t.id=i.transaction_id
      JOIN product_variants v ON v.user_id=i.user_id AND v.id=i.variant_id
      JOIN products p ON p.user_id=v.user_id AND p.id=v.product_id
      LEFT JOIN merchants m ON m.user_id=t.user_id AND m.id=t.merchant_id
      WHERE ${where.join(' AND ')} ORDER BY t.purchased_on ASC,t.id ASC,i.id ASC LIMIT ? OFFSET ?`,[...args,f.limit,f.offset]);
      return rows.map(r=>({lineItemId:String(r.lineItemId),transactionId:String(r.transactionId),purchasedOn:String(r.purchasedOn),productId:String(r.productId),variantId:String(r.variantId),variantName:String(r.variantName),merchantId:r.merchantId==null?null:String(r.merchantId),merchantName:r.merchantName==null?null:String(r.merchantName),quantityPurchased:String(r.quantityPurchased),netLineTotal:String(r.netLineTotal),packageQuantity:r.packageQuantity==null?null:String(r.packageQuantity),packageUnit:r.packageUnit==null?null:String(r.packageUnit),unitCount:r.unitCount==null?null:String(r.unitCount)}));
    },
    async close(){await pool.end();}
  };
}

import 'dotenv/config';
import mysql from 'mysql2/promise';
const url=process.env.DATABASE_URL;
if(!url) throw new Error('DATABASE_URL is required');
const db=await mysql.createConnection({uri:url});
try {
 const expected=['users','user_settings','merchants','receipts','receipt_files','receipt_extractions','purchase_transactions','categories','products','product_variants','product_aliases','grocery_line_items','line_item_adjustments','fuel_grades','gas_purchases','receipt_review_issues','audit_logs','receipt_processing_jobs'];
 const [rows]=await db.query<mysql.RowDataPacket[]>('SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()');
 const actual=new Set(rows.map(x=>x.name));
 const missing=expected.filter(x=>!actual.has(x));
 if(missing.length) throw new Error(`Missing tables: ${missing.join(', ')}`);
 console.log(`Verified ${expected.length} application tables`);
} finally {await db.end();}

/** SQL-first, tracked migrations. Never run against production without backup/restore test. */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const url=process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is missing');
const connection=await mysql.createConnection({uri:url,multipleStatements:false});
let locked=false;
try {
 const [[lock]] = await connection.query<mysql.RowDataPacket[]>('SELECT GET_LOCK(?, 20) AS acquired',['receipt_tracker_migrations']);
 if (lock.acquired !== 1) throw new Error('Unable to obtain database migration lock');
 locked=true;
 await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(191) PRIMARY KEY, checksum CHAR(64) NOT NULL,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 const dir=resolve('migrations');
 const files=(await readdir(dir)).filter(x=>/^\d+_[\w-]+\.sql$/.test(x)).sort();
 const [rows]=await connection.query<mysql.RowDataPacket[]>('SELECT version,checksum FROM schema_migrations');
 const applied=new Map(rows.map(x=>[x.version,x.checksum]));
 for(const file of files){
  const sql=await readFile(resolve(dir,file),'utf8');
  const hash=createHash('sha256').update(sql).digest('hex');
  if(applied.has(file)){
   if(applied.get(file)!==hash) throw new Error(`Migration changed after application: ${file}`);
   continue;
  }
  // Our SQL migrations contain no semicolon within string values, no procedures and no custom delimiters.
  const statements=sql.split(';').map(x=>x.replace(/^(?:\s*--[^\n]*\n)*/g,'').trim()).filter(Boolean);
  console.log(`Applying ${file} (${statements.length} statements)`);
  for(const stmt of statements) await connection.query(stmt);
  await connection.execute('INSERT INTO schema_migrations (version,checksum) VALUES (?,?)',[file,hash]);
  console.log(`Applied ${file}`);
 }
 console.log('Migrations complete');
} finally {
 if(locked) await connection.query('SELECT RELEASE_LOCK(?)',['receipt_tracker_migrations']);
 await connection.end();
}

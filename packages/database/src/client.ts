import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from './schema.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

export const pool = mysql.createPool({uri:databaseUrl,waitForConnections:true,connectionLimit:10,timezone:'Z',decimalNumbers:false});
export const db = drizzle({client:pool,schema,mode:'default'});
export async function closeDatabase():Promise<void> { await pool.end(); }

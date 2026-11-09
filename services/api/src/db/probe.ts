import { createPool, type Pool } from 'mysql2/promise';

export type DatabaseProbe = Readonly<{
  ping(): Promise<void>;
  close(): Promise<void>;
}>;

export function createDatabaseProbe(databaseUrl: string | undefined): DatabaseProbe {
  let pool: Pool | undefined;
  if (databaseUrl) {
    pool = createPool({
      uri: databaseUrl,
      waitForConnections: true,
      connectionLimit: 3,
      connectTimeout: 5000,
      timezone: 'Z',
      decimalNumbers: false,
    });
  }
  return {
    async ping(): Promise<void> {
      if (!pool) throw new Error('Database URL is not configured');
      await pool.query('SELECT 1');
    },
    async close(): Promise<void> { await pool?.end(); },
  };
}

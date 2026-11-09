import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise';
import type { Identity, UserStore, LocalUser, FuelSettings } from '../auth/types.js';

type UserRow = RowDataPacket & { id: string | number | bigint; email: string | null };
type SettingsRow = RowDataPacket & {
  gallons_per_fillup: string; fillups_per_week: string; currency_code: string; timezone: string;
};

export function createUserStore(databaseUrl: string): UserStore {
  const pool: Pool = createPool({ uri: databaseUrl, connectionLimit: 5, waitForConnections: true, timezone: 'Z', decimalNumbers: false });
  return {
    async sync(identity: Identity): Promise<LocalUser> {
      if (!identity.subject || identity.subject.length > 191) throw new Error('Invalid identity subject');
      if (identity.email && identity.email.length > 320) throw new Error('Invalid identity email');
      const cx = await pool.getConnection();
      try {
        await cx.beginTransaction();
        // Concurrency-safe with UNIQUE(auth_provider_subject). Never use client-provided user IDs.
        await cx.execute(
          `INSERT INTO users (auth_provider_subject,email) VALUES (?,?)
           ON DUPLICATE KEY UPDATE email = VALUES(email)`,
          [identity.subject, identity.email],
        );
        const [rows] = await cx.execute<UserRow[]>(
          'SELECT id,email FROM users WHERE auth_provider_subject = ? LIMIT 1', [identity.subject],
        );
        const row = rows[0];
        if (!row) throw new Error('User synchronization failed');
        const userId = String(row.id);
        await cx.execute('INSERT IGNORE INTO user_settings (user_id) VALUES (?)', [userId]);
        await cx.commit();
        return { id: userId, subject: identity.subject, email: row.email };
      } catch (error) {
        await cx.rollback();
        throw error;
      } finally { cx.release(); }
    },
    async getSettings(userId: string): Promise<FuelSettings | null> {
      // Always scope by the authenticated local user, never an ID from URL/query/body.
      const [rows] = await pool.execute<SettingsRow[]>(
        'SELECT gallons_per_fillup,fillups_per_week,currency_code,timezone FROM user_settings WHERE user_id = ? LIMIT 1',
        [userId],
      );
      const r = rows[0];
      return r ? {
        gallonsPerFillup: String(r.gallons_per_fillup), fillupsPerWeek: String(r.fillups_per_week),
        currencyCode: r.currency_code, timezone: r.timezone,
      } : null;
    },
    async close() { await pool.end(); },
  };
}

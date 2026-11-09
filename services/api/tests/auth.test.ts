import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import type { AuthServices, LocalUser } from '../src/auth/types.js';

const users = new Map<string, LocalUser>();
const settings = new Map<string, { gallonsPerFillup: string; fillupsPerWeek: string; currencyCode: string; timezone: string }>();
let brokenProfile = false;
const auth: AuthServices = {
  provider: {
    async verify(token) {
      if (token === 'expired' || token === 'invalid') throw new Error('secret verifying token');
      if (token === 'alpha') return 'clerk_alpha';
      if (token === 'beta') return 'clerk_beta';
      throw new Error('not recognized');
    },
    async getIdentity(subject) {
      if (brokenProfile) throw new Error('secret database connection string');
      return { subject, email: `${subject}@example.com` };
    },
  },
  store: {
    async sync(identity) {
      let user = users.get(identity.subject);
      if (!user) {
        user = { id: String(users.size + 1), subject: identity.subject, email: identity.email };
        users.set(identity.subject, user);
        settings.set(user.id, { gallonsPerFillup: '13.0000', fillupsPerWeek: '1.0000', currencyCode: 'USD', timezone: 'America/Chicago' });
      }
      return user;
    },
    async getSettings(userId) { return settings.get(userId) ?? null; },
    async close() {},
  },
};
let server: Server;
let base: string;
before(async () => {
  const app = createApp({ database: { ping: async () => {}, close: async () => {} }, auth });
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });
const get = (path: string, bearer?: string) => fetch(`${base}${path}`, bearer ? { headers: { Authorization: bearer } } : {});

test('health stays public', async () => { assert.equal((await get('/api/health')).status, 200); });
test('no authorization header returns 401', async () => {
  const r = await get('/api/me'); assert.equal(r.status, 401); assert.equal((await r.json()).error.code, 'AUTH_REQUIRED');
});
test('malformed bearer token returns 401', async () => {
  const r = await get('/api/me', 'Basic abc'); assert.equal(r.status, 401); assert.equal((await r.json()).error.code, 'INVALID_TOKEN');
});
test('expired or invalid token returns 401 without leaks', async () => {
  for (const token of ['expired', 'invalid']) {
    const r = await get('/api/me', `Bearer ${token}`); const body = await r.text();
    assert.equal(r.status, 401); assert.ok(!body.includes('secret'));
  }
});
test('first sign-in creates local account and subsequent call reuses identity', async () => {
  const a = await (await get('/api/me', 'Bearer alpha')).json();
  const b = await (await get('/api/me', 'Bearer alpha')).json();
  assert.equal(a.user.id, b.user.id); assert.equal(a.user.email, 'clerk_alpha@example.com'); assert.equal(users.size, 1);
});
test('a different session gets a different owner and cannot read another owner settings', async () => {
  const a = await (await get('/api/me', 'Bearer alpha')).json();
  const b = await (await get('/api/me', 'Bearer beta')).json();
  assert.notEqual(a.user.id, b.user.id);
  settings.set(a.user.id, { gallonsPerFillup: '21.0000', fillupsPerWeek: '2.0000', currencyCode: 'USD', timezone: 'America/Chicago' });
  const rb = await get(`/api/me/settings?userId=${a.user.id}`, 'Bearer beta');
  assert.equal(rb.status, 200); assert.equal((await rb.json()).settings.gallonsPerFillup, '13.0000');
});
test('Clerk profile outage returns sanitized 503', async () => {
  brokenProfile = true;
  try {
    const r = await get('/api/me', 'Bearer alpha'); const body = await r.text();
    assert.equal(r.status, 503); assert.equal(JSON.parse(body).error.code, 'AUTH_SERVICE_UNAVAILABLE');
    assert.ok(!body.includes('secret'));
  } finally { brokenProfile = false; }
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import { HttpError } from '../src/http/errors.js';

let server: Server;
let base: string;
let shouldFail = false;
let pings = 0;
const database = {
  async ping() { pings++; if (shouldFail) throw new Error('secret database connection string'); },
  async close() {},
};

before(async () => {
  const app = createApp({
    database,
    registerRoutes(a) {
      a.get('/test/expected-error', () => { throw new HttpError(422, 'TEST_ERROR', 'Expected problem'); });
      a.get('/test/unexpected-error', () => { throw new Error('secret internal message'); });
    },
  });
  server = await new Promise<Server>(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); });

test('health works without checking database', async () => {
  const old = pings;
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
  assert.equal(pings, old);
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.ok(r.headers.get('x-request-id'));
});
test('readiness verifies database and returns 200', async () => {
  shouldFail = false;
  const r = await fetch(`${base}/api/ready`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, database: 'connected' });
});
test('readiness returns 503 without leaking database errors', async () => {
  shouldFail = true;
  const r = await fetch(`${base}/api/ready`);
  const text = await r.text();
  assert.equal(r.status, 503);
  assert.equal(JSON.parse(text).error.code, 'DATABASE_UNAVAILABLE');
  assert.ok(!text.includes('secret'));
  shouldFail = false;
});
test('unknown endpoint returns 404 as JSON', async () => {
  const r = await fetch(`${base}/api/missing`);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error.code, 'NOT_FOUND');
});
test('invalid JSON returns 400', async () => {
  const r = await fetch(`${base}/test/expected-error`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not-json',
  });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, 'BAD_REQUEST');
});
test('body over 64kb returns 413', async () => {
  const r = await fetch(`${base}/test/expected-error`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(80_000) }),
  });
  assert.equal(r.status, 413);
  assert.equal((await r.json()).error.code, 'PAYLOAD_TOO_LARGE');
});
test('known error returns expected code and status', async () => {
  const r = await fetch(`${base}/test/expected-error`);
  assert.equal(r.status, 422);
  assert.equal((await r.json()).error.code, 'TEST_ERROR');
});
test('unexpected error returns safe 500 without leaking details', async () => {
  const r = await fetch(`${base}/test/unexpected-error`);
  const text = await r.text();
  assert.equal(r.status, 500);
  assert.equal(JSON.parse(text).error.code, 'INTERNAL_ERROR');
  assert.ok(!text.includes('secret'));
});
test('legacy health route remains available', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
});

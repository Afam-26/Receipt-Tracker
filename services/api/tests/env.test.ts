import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../src/config/env.js';

test('defaults to port 5001', () => {
  const config = readConfig({ NODE_ENV: 'test' });
  assert.equal(config.port, 5001);
  assert.equal(config.databaseUrl, undefined);
});
test('rejects invalid port', () => {
  for (const port of ['0', '65536', 'abc', '3000.5']) {
    assert.throws(() => readConfig({ PORT: port, NODE_ENV: 'test' }), /PORT/);
  }
});
test('rejects invalid NODE_ENV', () => {
  assert.throws(() => readConfig({ NODE_ENV: 'unknown' }), /NODE_ENV/);
});

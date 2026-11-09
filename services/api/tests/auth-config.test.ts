import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../src/config/env.js';

test('Clerk credentials read from environment and authorized parties split', () => {
  const c = readConfig({ NODE_ENV: 'test', CLERK_SECRET_KEY: 'sk_test_example', CLERK_ISSUER: 'https://example.clerk.accounts.dev', CLERK_AUTHORIZED_PARTIES: 'https://one.example, https://two.example' });
  assert.equal(c.clerkSecretKey, 'sk_test_example');
  assert.equal(c.clerkIssuer, 'https://example.clerk.accounts.dev');
  assert.deepEqual(c.clerkAuthorizedParties, ['https://one.example', 'https://two.example']);
});

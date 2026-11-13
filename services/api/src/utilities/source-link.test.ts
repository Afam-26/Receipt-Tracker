import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBill } from './validation.js';

const draft = {
  idempotencyKey: 'utility-source-stage3-test',
  category: 'electricity',
  providerName: 'Example Utility',
  serviceStart: '2026-10-01',
  serviceEnd: '2026-10-31',
  totalAmount: '120.50',
};

test('manual utility drafts remain unlinked', () => {
  assert.equal(parseBill(draft).sourceReceiptId, null);
});

test('source receipt IDs are explicit and validated', () => {
  assert.equal(parseBill({...draft, sourceReceiptId: '5'}).sourceReceiptId, '5');
  assert.throws(() => parseBill({...draft, sourceReceiptId: '0'}));
  assert.throws(() => parseBill({...draft, sourceReceiptId: 5}));
  assert.throws(() => parseBill({...draft, sourceReceiptId: '5 OR 1=1'}));
});

test('clients cannot supply a user ID or alter immutable ownership via draft input', () => {
  assert.throws(() => parseBill({...draft, userId: '2'}));
});

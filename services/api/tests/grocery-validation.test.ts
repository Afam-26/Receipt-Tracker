import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePurchase, parseList, decimal, isoDate, id } from '../src/grocery/validation.js';

test('invalid dates and unsafe ids rejected', () => {
  assert.throws(() => isoDate('2026-02-30','date'));
  assert.throws(() => id('1 OR 1=1','id'));
  assert.throws(() => id('18446744073709551616','id'));
});
test('currency precision enforced without rounding', () => {
  assert.equal(decimal('2.1234','price',4,12), '2.1234');
  assert.throws(() => decimal('2.12345','price',4,12));
  assert.throws(() => decimal(-1,'price',2,12));
});
test('missing values remain null and cannot be confirmed', () => {
  const draft = parsePurchase({ sourceTransactionId:'id-1', items:[{rawDescription:'Produce'}] });
  assert.equal(draft.items[0].quantityPurchased, null);
  assert.equal(draft.items[0].netLineTotal, null);
  assert.equal(draft.status,'needs_review');
  assert.throws(() => parsePurchase({ sourceTransactionId:'id-2', purchasedOn:'2026-11-09', status:'confirmed', items:[{rawDescription:'Produce'}] }));
});
test('reject invalid time range', () => assert.throws(() => parseList({from:'2026-11-09',to:'2026-10-01'})));

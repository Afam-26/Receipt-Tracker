import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText } from '../src/ocr/extract.js';

test('gas: before rewards and paid price remain distinct and unverified',()=>{
 const r=parseReceiptText(`FUEL STATION\n11/10/2026\nRegular\nGallons: 12.500\nPump price: $3.499\nRewards / gal: $0.300\nPaid price: $3.199\nTotal: $39.99`);
 assert.equal(r.receiptType,'gas');assert.equal(r.gas.grade?.value,'Regular');assert.equal(r.gas.beforeRewardsPricePerGallon?.value,'3.499');assert.equal(r.gas.paidPricePerGallon?.value,'3.199');assert.equal(r.gas.rewardsDiscountPerGallon?.value,'0.300');assert.equal(r.purchasedOn?.value,'2026-11-10');
});
test('missing original gas price is never inferred from discounted price',()=>{
 const r=parseReceiptText('FUEL STATION\n12/10/2026\nDiesel\nGallons: 10.00\nPaid price: 3.150\nTotal: 31.50');
 assert.equal(r.receiptType,'gas');assert.equal(r.gas.beforeRewardsPricePerGallon,null);assert.ok(r.reviewWarnings.some(x=>x.includes('Before-rewards')));
});
test('grocery: preserve separate identical lines, never auto-confirm',()=>{
 const r=parseReceiptText('GROCERY STORE\n2026-11-10\nAPPLES 2.99\nAPPLES 2.99\nTOTAL $5.98');
 assert.equal(r.receiptType,'grocery');assert.equal(r.groceryLines.length,2);assert.deepEqual(r.groceryLines.map(x=>x.amount),['2.99','2.99']);assert.equal(r.grandTotal?.value,'5.98');
});
test('unknown and invalid input remain reviewable without invented numbers',()=>{
 const r=parseReceiptText('THANK YOU\nhello\n99/99/2026');
 assert.equal(r.receiptType,'unknown');assert.equal(r.purchasedOn,null);assert.equal(r.grandTotal,null);assert.equal(r.gas.beforeRewardsPricePerGallon,null);
});
test('mixed indicators are conservatively labeled mixed',()=>{
 assert.equal(parseReceiptText('Groceries\nGasoline\nFuel\nTOTAL $45.00').receiptType,'mixed');
});

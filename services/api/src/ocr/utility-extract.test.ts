import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUtilityText} from './utility-extract.js';

test('parses clearly labeled utility values as unverified suggestions',()=>{
  const text=`Sample Electricity Company
Provider: Sample Electric
Billing period: 10/01/2026 to 10/31/2026
Due date: 11/15/2026
Usage: 450 kWh
Rate per unit: $0.125
Amount due: $120.50`;
  const r=parseUtilityText(text);
  assert.equal(r.category?.value,'electricity');
  assert.equal(r.providerName?.value,'Sample Electric');
  assert.equal(r.serviceStart?.value,'2026-10-01');
  assert.equal(r.serviceEnd?.value,'2026-10-31');
  assert.equal(r.dueDate?.value,'2026-11-15');
  assert.equal(r.usageAmount?.value,'450');
  assert.equal(r.totalAmount?.value,'120.50');
  assert.equal(r.totalAmount?.confidence,'low');
});

test('does not invent absent period or amount',()=>{
  const r=parseUtilityText('Electric service\nAccount number: 11223344\nPrevious balance: $98.00');
  assert.equal(r.serviceStart,null);
  assert.equal(r.serviceEnd,null);
  assert.equal(r.totalAmount,null);
});

test('rejects ambiguous categories and invalid dates',()=>{
  const r=parseUtilityText('Water utility and electricity\nBilling period: 02/30/2026 to 03/31/2026\nTotal amount due: $40.00');
  assert.equal(r.category,null);
  assert.equal(r.serviceStart,null);
  assert.equal(r.totalAmount?.value,'40.00');
});

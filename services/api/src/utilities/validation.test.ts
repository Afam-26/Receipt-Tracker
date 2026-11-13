import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBill,parseRevision,filters} from './validation.js';
const good={idempotencyKey:'test-fixture-123',category:'electricity',providerName:'Sample Utility',serviceStart:'2026-10-01',serviceEnd:'2026-10-31',totalAmount:'120.50',usageAmount:'450',usageUnit:'kWh'};
test('valid utility bill remains a draft input',()=>{const r=parseBill(good);assert.equal(r.totalAmount,'120.50');assert.equal(r.ratePerUnit,null);});
test('rejects invalid calendar dates, periods and unknown fields',()=>{
  assert.throws(()=>parseBill({...good,serviceStart:'2026-02-31'}));
  assert.throws(()=>parseBill({...good,serviceEnd:'2026-09-30'}));
  assert.throws(()=>parseBill({...good,userId:99}));
});
test('rejects negative or excessive currency precision',()=>{
  assert.throws(()=>parseBill({...good,totalAmount:'-1'}));
  assert.throws(()=>parseBill({...good,totalAmount:'1.001'}));
});
test('rejects unsafe pagination and invalid revision',()=>{
  assert.throws(()=>filters({limit:'99999'}));assert.throws(()=>parseRevision(0));
});

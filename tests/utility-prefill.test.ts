import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeUtilityPrefill} from '../apps/mobile/src/lib/utility-prefill.js';
const c=(value:string)=>({value,evidence:'Sample utility bill',confidence:'low'});
test('missing OCR information does not invent a bill',()=>{
  assert.deepEqual(makeUtilityPrefill(null),{});
  assert.deepEqual(makeUtilityPrefill({reviewWarnings:[]}),{});
});
test('accepts labeled values while leaving missing fields blank',()=>{
  assert.deepEqual(makeUtilityPrefill({category:c('electricity'),providerName:c('Example Electric'),serviceStart:c('2026-10-01'),serviceEnd:c('2026-10-31'),totalAmount:c('120.50'),usageAmount:c('450'),usageUnit:c('kWh'),ratePerUnit:c('0.125000')}),{
    category:'electricity',providerName:'Example Electric',serviceStart:'2026-10-01',serviceEnd:'2026-10-31',totalAmount:'120.50',usageAmount:'450',usageUnit:'kWh',ratePerUnit:'0.125000'
  });
});
test('rejects invalid billing dates, ambiguous categories and invalid prices',()=>{
  assert.deepEqual(makeUtilityPrefill({category:c('electricity_and_gas'),serviceStart:c('2026-02-31'),serviceEnd:c('2026-03-05'),totalAmount:c('120.567'),usageUnit:c('kWh'),ratePerUnit:c('-1')}),{});
});

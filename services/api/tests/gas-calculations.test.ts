import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateImpact,getRankings,latestImpact,type PriceObservation } from '../src/gas/calculations.js';
import { parseGasPurchase,parseGasFilters,parseAssumptions } from '../src/gas/validation.js';
const assumptions={gallonsPerFillup:'13',fillsPerWeek:'1'};
const observation=(id:string,day:string,grade:string,price:string):PriceObservation=>({id,transactionId:id,purchasedOn:day,fuelGradeId:grade,regularPricePerGallon:price,gallons:'13.0000',totalPaid:'42.00',rewardDiscountPerGallon:'0.2000',paidPricePerGallon:'3.0000',merchantId:null,receiptId:null,rawFuelGrade:null,priceSource:'printed'});
test('price impact uses regular price and changes instantly with assumptions',()=>{
  const impact=calculateImpact('3.4990','3.8990',assumptions);
  assert.equal(impact.increasePerGallon,'0.4000');
  assert.equal(impact.percentageIncrease,'11.4318');
  assert.equal(impact.extraCostPerFillup,'5.20');
  assert.equal(impact.estimatedAnnualExtraCost,'270.40');
  assert.equal(impact.estimatedMonthlyExtraCost,'22.53');
  assert.equal(calculateImpact('3.4990','3.8990',{gallonsPerFillup:'20',fillsPerWeek:'2'}).estimatedAnnualExtraCost,'832.00');
});
test('zero baseline never fabricates a percentage; decreases show negative costs',()=>{
  assert.equal(calculateImpact('0','3',assumptions).percentageIncrease,null);
  assert.equal(calculateImpact('4','3',assumptions).estimatedAnnualExtraCost,'-676.00');
});
test('rankings compare the same grade only and only increases',()=>{
  const rows=[observation('1','2026-01-01','1','3.0000'),observation('2','2026-01-02','2','5.0000'),observation('3','2026-01-03','1','3.5000'),observation('4','2026-01-04','1','3.2000')];
  const ranks=getRankings(rows,assumptions,'previous');
  assert.equal(ranks.length,1);assert.equal(ranks[0].previousPurchaseId,'1');assert.equal(ranks[0].newPurchaseId,'3');
  const lowest=getRankings(rows,assumptions,'lowest');
  assert.equal(lowest.length,2);assert.equal(lowest[1].previousPurchaseId,'1');
});
test('live impact uses latest dated purchase and immediately previous of same grade',()=>{
  const rows=[observation('1','2026-01-01','1','3.0000'),observation('2','2026-01-02','2','5.0000'),observation('3','2026-01-03','1','3.5000'),observation('4','2026-01-04','2','5.1000')];
  const live=latestImpact(rows,assumptions);
  assert.equal(live?.previousPurchaseId,'2');assert.equal(live?.latestPurchaseId,'4');
  assert.equal(latestImpact(rows.slice(0,1),assumptions)?.comparisonAvailable,false);
});
test('gas values require explicit original price and valid precise discounts',()=>{
  const body={sourceTransactionId:'mobile-55',purchasedOn:'2026-11-09',fuelGradeId:'1',regularPricePerGallon:'3.4990',paidPricePerGallon:'3.1990',rewardDiscountPerGallon:'0.3000',gallons:'13.0000',totalPaid:'41.59',priceSource:'printed',status:'confirmed'};
  assert.equal(parseGasPurchase(body).regularPricePerGallon,'3.4990');
  assert.throws(()=>parseGasPurchase({...body,rewardDiscountPerGallon:'0.2000'}));
  assert.throws(()=>parseGasPurchase({...body,regularPricePerGallon:null}));
  assert.throws(()=>parseGasPurchase({...body,fuelGradeId:null}));
  assert.throws(()=>parseGasPurchase({...body,gallons:'13.00001'}));
  assert.equal(parseGasPurchase({...body,status:'needs_review',fuelGradeId:null,regularPricePerGallon:null,priceSource:'unknown'}).fuelGradeId,null);
});
test('assumptions and list dates are constrained',()=>{
  assert.deepEqual(parseAssumptions({gallonsPerFillup:'13',fillsPerWeek:'1'}),assumptions);
  assert.throws(()=>parseAssumptions({gallonsPerFillup:'0',fillsPerWeek:'1'}));
  assert.throws(()=>parseGasFilters({from:'2026-12-01',to:'2026-01-01'}));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReviewDraft, validateForConfirmation } from '../src/review/validation.js';
const grocery={extractionId:'3',receiptType:'grocery',purchasedOn:'2026-11-10',merchantId:null,grandTotal:'22.76',items:[
 {rawDescription:'MILK',variantId:'17',quantityPurchased:'1',netLineTotal:'4.29'},
 {rawDescription:'MILK',variantId:'17',quantityPurchased:'1',netLineTotal:'4.29'}]};
test('review draft accepts repeated lines and preserves their order',()=>{
 const result=parseReviewDraft(grocery);assert.equal(result.items.length,2);
 assert.equal(validateForConfirmation('2',result).kind,'grocery');
});
test('cannot confirm grocery without explicitly linked variants or quantities',()=>{
 const draft=parseReviewDraft({...grocery,items:[{rawDescription:'MILK',netLineTotal:'4.29'}]});
 assert.throws(()=>validateForConfirmation('2',draft));
});
test('cannot confirm unknown receipt type or inject unexpected keys',()=>{
 assert.throws(()=>parseReviewDraft({...grocery,receiptType:'unknown'}));
 assert.throws(()=>parseReviewDraft({...grocery,userId:'6'}));
});
test('gas confirmation requires explicit original price, grade and gallons',()=>{
 const base={extractionId:'3',receiptType:'gas',purchasedOn:'2026-11-10',grandTotal:'31.99',
  gas:{fuelGradeId:'1',regularPricePerGallon:'3.4990',rewardDiscountPerGallon:'0.3000',paidPricePerGallon:'3.1990',gallons:'10',totalPaid:'31.99',priceSource:'confirmed'}};
 assert.equal(validateForConfirmation('5',parseReviewDraft(base)).kind,'gas');
 assert.throws(()=>validateForConfirmation('5',parseReviewDraft({...base,gas:{...base.gas,regularPricePerGallon:null,priceSource:'unknown'}})));
 assert.throws(()=>validateForConfirmation('5',parseReviewDraft({...base,gas:{...base.gas,paidPricePerGallon:'3.5000'}})));
});
test('cannot accept negative, overprecision or invalid dates',()=>{
 assert.throws(()=>parseReviewDraft({...grocery,purchasedOn:'2026-02-30'}));
 assert.throws(()=>parseReviewDraft({...grocery,grandTotal:'-1.00'}));
 assert.throws(()=>parseReviewDraft({...grocery,items:[{rawDescription:'RICE',quantityPurchased:'0'}]}));
});

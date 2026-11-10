import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalizedPrice,groceryTrend,merchantComparison,type GroceryObservation} from '../src/analytics/calculations.js';
import {parseGroceryAnalyticsQuery} from '../src/analytics/validation.js';
const base:GroceryObservation={lineItemId:'1',transactionId:'1',purchasedOn:'2026-11-01',productId:'10',variantId:'11',variantName:'Rice',merchantId:'1',merchantName:'Shop A',quantityPurchased:'2.0000',netLineTotal:'10.00',packageQuantity:'500.0000',packageUnit:'g',unitCount:null};
test('per-package and 100-gram costs use decimal-safe calculations',()=>{
 const n=normalizedPrice(base)!;assert.equal(n.pricePerPackage,'5.0000');assert.equal(n.pricePerStandardUnit,'1.0000');assert.equal(n.basis,'100 g');
});
test('equivalent kg and g units normalize to identical basis',()=>{
 const a=normalizedPrice({...base,packageQuantity:'0.5000',packageUnit:'kg'});
 const b=normalizedPrice(base);assert.deepEqual(a,b);
});
test('volume normalization and unknown packaging avoid false equivalence',()=>{
 const v=normalizedPrice({...base,packageQuantity:'1000',packageUnit:'ml'});
 assert.equal(v.pricePerStandardUnit,'0.5000');assert.equal(v.basis,'100 mL');
 assert.equal(normalizedPrice({...base,packageQuantity:null})?.pricePerStandardUnit,null);
 assert.equal(normalizedPrice({...base,packageUnit:'unknown'})?.pricePerStandardUnit,null);
});
test('one purchase with repeated line entries remains two observations',()=>{
 const rows=groceryTrend([base,{...base,lineItemId:'2'}]);assert.equal(rows.length,2);
 assert.deepEqual(rows.map(r=>r.lineItemId),['1','2']);
 assert.equal(rows[1].changeFromPreviousUnitPrice,'0.0000');
});
test('trend keeps different package units separate and calculates negative changes',()=>{
 const rows=groceryTrend([base,{...base,lineItemId:'2',netLineTotal:'8.00'},
 {...base,lineItemId:'3',packageUnit:'ml',packageQuantity:'1000'}]);
 assert.equal(rows[1].changeFromPreviousUnitPrice,'-0.2000');
 assert.equal(rows[1].percentageChangeFromPrevious,'-20.0000');
 assert.equal(rows[2].changeFromPreviousUnitPrice,null);
});
test('merchant summaries stay within compatible basis groups and count samples',()=>{
 const rows=[base,{...base,lineItemId:'2',merchantId:'2',merchantName:'Shop B',netLineTotal:'8.00'},
 {...base,lineItemId:'3',merchantId:'1',packageQuantity:'1000',packageUnit:'ml'}];
 const out=merchantComparison(rows);
 assert.equal(out.length,3);
 assert.equal(out.find(x=>x.merchantId==='2')?.averageUnitPrice,'0.8000');
 assert.equal(out.find(x=>x.merchantId==='1'&&x.basis==='100 mL')?.averageUnitPrice,'0.5000');
});
test('query validation requires product and rejects unsafe pagination or date',()=>{
 assert.throws(()=>parseGroceryAnalyticsQuery({}));
 assert.throws(()=>parseGroceryAnalyticsQuery({productId:'10',limit:'1000'}));
 assert.throws(()=>parseGroceryAnalyticsQuery({productId:'10',from:'2026-12-01',to:'2026-11-01'}));
 assert.equal(parseGroceryAnalyticsQuery({productId:'10',limit:'2'}).limit,2);
});

/** Grocery normalization is only valid for explicitly recorded packaging and units. */
export type GroceryObservation = {
  lineItemId:string; transactionId:string; purchasedOn:string; productId:string; variantId:string;
  variantName:string; merchantId:string|null; merchantName:string|null;
  quantityPurchased:string; netLineTotal:string; packageQuantity:string|null;
  packageUnit:string|null; unitCount:string|null;
};
function decimal(s:string,scale:number):bigint {
  if(!/^\d+(?:\.\d+)?$/.test(s))throw new Error('Invalid stored decimal');
  const [a,b='']=s.split('.');if(b.length>scale)throw new Error('Unexpected precision');
  return BigInt(a)*10n**BigInt(scale)+BigInt(b.padEnd(scale,'0'));
}
function fixed(n:bigint,scale:number):string {
  const b=10n**BigInt(scale);return `${n/b}.${String(n%b).padStart(scale,'0')}`;
}
function divideRound(num:bigint,den:bigint):bigint {
  if(den<=0n)throw new Error('Invalid denominator');return (num+den/2n)/den;
}
/** Conversion factors to grams/mL represented as numerator / 10^10. No floating-point cost arithmetic. */
const conversions:Record<string,{dimension:'mass'|'volume'|'count';factor:bigint;basis:string;basisQuantity:number}>={
  g:{dimension:'mass',factor:10000000000n,basis:'100 g',basisQuantity:100},
  gram:{dimension:'mass',factor:10000000000n,basis:'100 g',basisQuantity:100},
  grams:{dimension:'mass',factor:10000000000n,basis:'100 g',basisQuantity:100},
  kg:{dimension:'mass',factor:10000000000000n,basis:'100 g',basisQuantity:100},
  oz:{dimension:'mass',factor:283495231250n,basis:'100 g',basisQuantity:100},
  lb:{dimension:'mass',factor:4535923700000n,basis:'100 g',basisQuantity:100},
  lbs:{dimension:'mass',factor:4535923700000n,basis:'100 g',basisQuantity:100},
  ml:{dimension:'volume',factor:10000000000n,basis:'100 mL',basisQuantity:100},
  l:{dimension:'volume',factor:10000000000000n,basis:'100 mL',basisQuantity:100},
  liter:{dimension:'volume',factor:10000000000000n,basis:'100 mL',basisQuantity:100},
  'fl oz':{dimension:'volume',factor:295735295625n,basis:'100 mL',basisQuantity:100},
  floz:{dimension:'volume',factor:295735295625n,basis:'100 mL',basisQuantity:100},
  each:{dimension:'count',factor:10000000000n,basis:'each',basisQuantity:1},
  ct:{dimension:'count',factor:10000000000n,basis:'each',basisQuantity:1},
  count:{dimension:'count',factor:10000000000n,basis:'each',basisQuantity:1},
};
export function normalizedPrice(r:GroceryObservation) {
  const lineCents=decimal(r.netLineTotal,2);
  const qty=decimal(r.quantityPurchased,4);
  if(qty===0n)return null;
  // USD per purchased package (not per individual apple/bottle unless package detail is explicit).
  const perPackage=fixed(divideRound(lineCents*1000000n,qty),4);
  const base={pricePerPackage:perPackage,pricePerStandardUnit:null as string|null,
    basis:null as string|null,dimension:null as string|null};
  const unit=(r.packageUnit??'').trim().toLowerCase();
  const conversion=conversions[unit];
  const packageSize=r.packageQuantity??(unit==='each'||unit==='ct'||unit==='count'?r.unitCount:null);
  if(!conversion || !packageSize)return base;
  const amount=decimal(packageSize,4);
  if(amount===0n)return base;
  // USD per basis = cents * 10^4 qtyscale * 10^4 packscale * 10^10 factor scale
  // * 10^4 output scale * basisQuantity / (100 cents * qty * amount * factor).
  const numerator=lineCents*10000n*10000n*10000000000n*10000n*BigInt(conversion.basisQuantity);
  const denominator=100n*qty*amount*conversion.factor;
  return {...base,pricePerStandardUnit:fixed(divideRound(numerator,denominator),4),basis:conversion.basis,dimension:conversion.dimension};
}
export function groceryTrend(rows:GroceryObservation[]) {
  // Compare only the same variant and standard basis; never claim a trend across
  // incompatible package measurements or across unrelated product variants.
  const previous=new Map<string,bigint>();
  return rows.map(row=>{
    const norm=normalizedPrice(row);
    const unit=norm?.pricePerStandardUnit;
    const key=JSON.stringify([row.variantId,norm?.basis]);
    const prior=unit&&norm?.basis?previous.get(key):undefined;
    const current=unit?decimal(unit,4):null;
    const change=(current!==null&&prior!==undefined)?current-prior:null;
    if(current!==null&&norm?.basis)previous.set(key,current);
    const delta=change===null?null:(change<0n?'-':'')+fixed(change<0n?-change:change,4);
    const percentage=change===null||prior===undefined||prior===0n?null:
      (change<0n?'-':'')+fixed(divideRound((change<0n?-change:change)*1000000n,prior),4);
    return {...row,...norm,changeFromPreviousUnitPrice:delta,percentageChangeFromPrevious:percentage};
  });
}
export function merchantComparison(rows:GroceryObservation[]) {
  const by=new Map<string,{merchantId:string|null;merchantName:string|null;basis:string;dimension:string;total:bigint;count:number;min:bigint;max:bigint}>();
  for(const row of rows){
    const norm=normalizedPrice(row);
    if(!norm?.pricePerStandardUnit||!norm.basis||!norm.dimension)continue;
    const key=JSON.stringify([row.merchantId,norm.basis]);
    const amount=decimal(norm.pricePerStandardUnit,4);
    let entry=by.get(key);
    if(!entry){entry={merchantId:row.merchantId,merchantName:row.merchantName,basis:norm.basis,dimension:norm.dimension,total:0n,count:0,min:amount,max:amount};by.set(key,entry);}
    entry.total+=amount;entry.count++;if(amount<entry.min)entry.min=amount;if(amount>entry.max)entry.max=amount;
  }
  return [...by.values()].map(x=>({merchantId:x.merchantId,merchantName:x.merchantName,basis:x.basis,
    sampleCount:x.count,averageUnitPrice:fixed(divideRound(x.total,BigInt(x.count)),4),
    lowestUnitPrice:fixed(x.min,4),highestUnitPrice:fixed(x.max,4)}))
    .sort((a,b)=>a.basis.localeCompare(b.basis)||(decimal(a.averageUnitPrice,4)<decimal(b.averageUnitPrice,4)?-1:decimal(a.averageUnitPrice,4)>decimal(b.averageUnitPrice,4)?1:0));
}

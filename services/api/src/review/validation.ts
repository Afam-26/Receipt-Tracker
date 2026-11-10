import { HttpError } from '../http/errors.js';
import { decimal, id, invalid, isoDate, object, string, parsePurchase } from '../grocery/validation.js';
import { parseGasPurchase } from '../gas/validation.js';

export type ReviewType = 'grocery' | 'gas';
export type ReviewDraft = {
  extractionId: string;
  receiptType: ReviewType;
  purchasedOn: string | null;
  merchantId: string | null;
  grandTotal: string | null;
  items: Array<{
    rawDescription: string; variantId: string | null; quantityPurchased: string | null;
    measurementUnit: string | null; measuredAmount: string | null;
    listedUnitPrice: string | null; grossLineTotal: string | null; netLineTotal: string | null;
  }>;
  gas: {
    fuelGradeId: string | null; rawFuelGrade: string | null;
    regularPricePerGallon: string | null; rewardDiscountPerGallon: string | null;
    paidPricePerGallon: string | null; gallons: string | null;
    totalPaid: string | null; priceSource: 'unknown' | 'printed' | 'confirmed';
  } | null;
};
function keys(value: Record<string,unknown>, allowed: string[]) {
  if (Object.keys(value).some(k=>!allowed.includes(k))) invalid('Unexpected review field');
}
export function parseReviewDraft(body:unknown): ReviewDraft {
  const b=object(body);
  keys(b,['extractionId','receiptType','purchasedOn','merchantId','grandTotal','items','gas']);
  const extractionId=id(b.extractionId,'extractionId')!;
  if (b.receiptType!=='grocery'&&b.receiptType!=='gas') invalid('Select grocery or gas for review');
  const receiptType=b.receiptType as ReviewType;
  const purchasedOn=isoDate(b.purchasedOn,'purchasedOn');
  const merchantId=id(b.merchantId,'merchantId',false);
  const grandTotal=decimal(b.grandTotal,'grandTotal',2,12);
  if (receiptType==='grocery' && b.gas!==undefined && b.gas!==null) invalid('Grocery review cannot contain gas fields');
  if (receiptType==='gas' && b.items!==undefined && b.items!==null) invalid('Gas review cannot contain grocery items');
  const items:Array<ReviewDraft['items'][number]>=[];
  if (receiptType==='grocery') {
    const supplied=b.items??[];
    if (!Array.isArray(supplied)||supplied.length>100) invalid('items must have at most 100 entries');
    for (const val of supplied) {
      const row=object(val);
      keys(row,['rawDescription','variantId','quantityPurchased','measurementUnit','measuredAmount','listedUnitPrice','grossLineTotal','netLineTotal']);
      items.push({rawDescription:string(row.rawDescription,'rawDescription',512)!,variantId:id(row.variantId,'variantId',false),
        quantityPurchased:decimal(row.quantityPurchased,'quantityPurchased',4,12,false,true),
        measurementUnit:string(row.measurementUnit,'measurementUnit',32,false),
        measuredAmount:decimal(row.measuredAmount,'measuredAmount',4,12,false,true),
        listedUnitPrice:decimal(row.listedUnitPrice,'listedUnitPrice',4,12),
        grossLineTotal:decimal(row.grossLineTotal,'grossLineTotal',2,12),
        netLineTotal:decimal(row.netLineTotal,'netLineTotal',2,12)});
    }
  }
  let gas:ReviewDraft['gas']=null;
  if (receiptType==='gas') {
    const g=object(b.gas??{});
    keys(g,['fuelGradeId','rawFuelGrade','regularPricePerGallon','rewardDiscountPerGallon','paidPricePerGallon','gallons','totalPaid','priceSource']);
    if (g.priceSource!==undefined && !['unknown','printed','confirmed'].includes(String(g.priceSource))) invalid('Invalid priceSource');
    gas={fuelGradeId:id(g.fuelGradeId,'fuelGradeId',false),rawFuelGrade:string(g.rawFuelGrade,'rawFuelGrade',128,false),
      regularPricePerGallon:decimal(g.regularPricePerGallon,'regularPricePerGallon',4,10),
      rewardDiscountPerGallon:decimal(g.rewardDiscountPerGallon,'rewardDiscountPerGallon',4,10),
      paidPricePerGallon:decimal(g.paidPricePerGallon,'paidPricePerGallon',4,10),
      gallons:decimal(g.gallons,'gallons',4,12,false,true),totalPaid:decimal(g.totalPaid,'totalPaid',2,12),
      priceSource:(g.priceSource??'unknown') as 'unknown'|'printed'|'confirmed'};
  }
  return {extractionId,receiptType,purchasedOn,merchantId,grandTotal,items,gas};
}
export function validateForConfirmation(receiptId:string, draft:ReviewDraft) {
  const sourceTransactionId=`receipt-confirmed-${receiptId}`;
  if (!draft.purchasedOn||draft.grandTotal===null) invalid('Confirmed receipt requires date and grand total');
  if (draft.receiptType==='grocery') {
    if (!draft.items.length) invalid('At least one grocery line is required');
    const value=parsePurchase({...draft,sourceTransactionId,receiptId,status:'confirmed'});
    if(value.items.some(x=>x.netLineTotal===null||x.variantId===null||x.quantityPurchased===null)) invalid('Every confirmed grocery line needs a variant, quantity and net line total');
    return {kind:'grocery' as const,value};
  }
  if (!draft.gas) invalid('Gas data required');
  if (draft.gas.priceSource==='unknown') invalid('Before-rewards gas price must be explicitly verified');
  const value=parseGasPurchase({ ...draft.gas,sourceTransactionId,receiptId,merchantId:draft.merchantId,
    purchasedOn:draft.purchasedOn,status:'confirmed'});
  return {kind:'gas' as const,value};
}
export function parseRevision(value:unknown):string|null { return id(value,'expectedRevision',false); }
export function requireAcknowledgement(value:unknown):void {
  if (value!==true) throw new HttpError(400,'REVIEW_ACK_REQUIRED','Explicit review acknowledgement required');
}

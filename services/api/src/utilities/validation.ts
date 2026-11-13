export const CATEGORIES = ['electricity','water','natural_gas','internet','phone','trash','other'] as const;
export type Category = typeof CATEGORIES[number];
export type BillInput = {
  idempotencyKey: string; category: Category; providerName: string; accountLabel: string|null;
  serviceStart:string; serviceEnd:string; dueDate:string|null; usageAmount:string|null;
  usageUnit:string|null; ratePerUnit:string|null; baseCharge:string|null;
  taxesFees:string|null; totalAmount:string|null; notes:string|null; sourceReceiptId:string|null;
};
export class UtilityError extends Error { constructor(public status:number, public code:string, message:string){super(message);} }
const fail=(field:string):never=>{throw new UtilityError(400,'INVALID_UTILITY_BILL',`Invalid ${field}`);};
const obj=(x:unknown):Record<string,unknown>=> x && typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:fail('body');
const str=(x:unknown,key:string,max:number,required=false):string|null=>{
  if(x===undefined||x===null||x===''){if(required)fail(key);return null;}
  if(typeof x!=='string')fail(key); const value=(x as string).trim();
  if(!value||value.length>max){if(required||value.length>max)fail(key);return null;}
  return value;
};
const date=(x:unknown,key:string,required=false):string|null=>{
  const v=str(x,key,10,required);if(v===null)return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))fail(key);
  const [y,m,d]=v.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)fail(key);
  return v;
};
const decimal=(x:unknown,key:string,scale:number,maxInteger=10):string|null=>{
  const v=str(x,key,maxInteger+scale+2);if(v===null)return null;
  if(!new RegExp(`^\\d{1,${maxInteger}}(?:\\.\\d{1,${scale}})?$`).test(v))fail(key);
  return v;
};
export function parseBill(raw:unknown):BillInput {
  const x=obj(raw);
  const allowed=new Set(['idempotencyKey','category','providerName','accountLabel','serviceStart','serviceEnd','dueDate','usageAmount','usageUnit','ratePerUnit','baseCharge','taxesFees','totalAmount','notes','sourceReceiptId']);
  for(const k of Object.keys(x))if(!allowed.has(k))fail(k);
  const category=str(x.category,'category',32,true);
  if(!CATEGORIES.includes(category as Category))fail('category');
  const serviceStart=date(x.serviceStart,'serviceStart',true)!;
  const serviceEnd=date(x.serviceEnd,'serviceEnd',true)!;
  if(serviceStart>serviceEnd)fail('service period');
  const dueDate=date(x.dueDate,'dueDate');
  const usageAmount=decimal(x.usageAmount,'usageAmount',4);
  const usageUnit=str(x.usageUnit,'usageUnit',24);
  const ratePerUnit=decimal(x.ratePerUnit,'ratePerUnit',6);
  if((usageAmount===null)!==(usageUnit===null))fail('usage amount and unit must both be specified');
  return {idempotencyKey:str(x.idempotencyKey,'idempotencyKey',100,true)!,category:category as Category,
    providerName:str(x.providerName,'providerName',160,true)!,accountLabel:str(x.accountLabel,'accountLabel',100),
    serviceStart,serviceEnd,dueDate,usageAmount,usageUnit,ratePerUnit,
    baseCharge:decimal(x.baseCharge,'baseCharge',2),taxesFees:decimal(x.taxesFees,'taxesFees',2),
    totalAmount:decimal(x.totalAmount,'totalAmount',2),notes:str(x.notes,'notes',1000),
    sourceReceiptId:x.sourceReceiptId===undefined||x.sourceReceiptId===null?null:parseId(x.sourceReceiptId)};
}
export function parseId(value:unknown):string{
  if(typeof value!=='string'||!/^[1-9]\d{0,18}$/.test(value))throw new UtilityError(400,'INVALID_ID','Invalid bill ID');
  return value;
}
export function parseRevision(value:unknown):number{
  if(!Number.isSafeInteger(value)||Number(value)<1)throw new UtilityError(400,'INVALID_REVISION','Expected revision is required');
  return Number(value);
}
export function filters(raw:Record<string,unknown>){
  const category=raw.category===undefined?'':str(raw.category,'category',32)||'';
  if(category&&!CATEGORIES.includes(category as Category))fail('category');
  const from=date(raw.from,'from'),to=date(raw.to,'to');if(from&&to&&from>to)fail('date range');
  const limit=raw.limit===undefined?100:Number(raw.limit);
  if(!Number.isSafeInteger(limit)||limit<1||limit>500)fail('limit');
  return {category,from,to,limit};
}

/** Utility OCR suggestions: never evidence of payment or an authorized bill. */
export type UtilityCandidate = { value: string; evidence: string; confidence: 'low' | 'medium' };
export type UtilitySuggestions = {
  category: UtilityCandidate | null;
  providerName: UtilityCandidate | null;
  serviceStart: UtilityCandidate | null;
  serviceEnd: UtilityCandidate | null;
  dueDate: UtilityCandidate | null;
  totalAmount: UtilityCandidate | null;
  usageAmount: UtilityCandidate | null;
  usageUnit: UtilityCandidate | null;
  ratePerUnit: UtilityCandidate | null;
  reviewWarnings: string[];
};
const candidate = (value:string, evidence:string):UtilityCandidate => ({value,evidence:evidence.slice(0,160),confidence:'low'});
function dateIso(value:string):string|null {
  const m=value.trim().match(/^(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)$/);
  if(m){const iso=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`; const d=new Date(iso+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:null;}
  const n=value.trim().match(/^([01]?\d)[-/]([0-3]?\d)[-/](20\d{2})$/);
  if(!n)return null;
  return dateIso(`${n[3]}-${n[1]}-${n[2]}`);
}
function positiveNumber(raw:string,decimals:number):string|null {
  const clean=raw.replace(/,/g,'');
  if(!/^\d{1,10}(?:\.\d{1,6})?$/.test(clean))return null;
  const num=Number(clean);if(!Number.isFinite(num)||num<0||num>9999999999)return null;
  if(clean.includes('.')&&clean.split('.')[1].length>decimals)return null;
  return clean;
}
export function parseUtilityText(input:string):UtilitySuggestions {
  const lines=input.split(/\r?\n/).map(v=>v.trim()).filter(Boolean).slice(0,350);
  const text=lines.join('\n');
  const find=(re:RegExp):{line:string;match:RegExpMatchArray}|null=>{
    for(const line of lines){const match=line.match(re);if(match)return {line,match};}return null;
  };
  const identified:UtilitySuggestions={category:null,providerName:null,serviceStart:null,serviceEnd:null,dueDate:null,totalAmount:null,usageAmount:null,usageUnit:null,ratePerUnit:null,reviewWarnings:['Utility OCR is unverified. Compare every value with the original statement.', 'A statement is not proof that a bill was paid.']};
  const categorySignals:[string,RegExp][]=[
    ['electricity',/\b(?:electricity|electric service|electric usage|kilowatt|kwh)\b/i],
    ['water',/\b(?:water utility|water service|water consumption|sewer|wastewater)\b/i],
    ['natural_gas',/\b(?:natural gas service|gas utility|gas therms|therms)\b/i],
    ['internet',/\b(?:internet service|broadband|fiber internet|wifi service)\b/i],
    ['phone',/\b(?:mobile plan|wireless service|phone bill|cellular plan)\b/i],
    ['trash',/\b(?:waste collection|garbage collection|recycling service|trash service)\b/i]
  ];
  const matchedCategories=categorySignals.filter(([,re])=>re.test(text));
  if(matchedCategories.length===1){const found=find(matchedCategories[0][1]);identified.category=candidate(matchedCategories[0][0],found?.line??'Category keyword');}
  else if(matchedCategories.length>1)identified.reviewWarnings.push('Multiple utility types found; choose the correct category manually.');
  const provider=find(/^(?:provider|service provider|company|billed by)\s*[:#-]\s*(.{3,100})$/i);
  if(provider)identified.providerName=candidate(provider.match[1].trim(),provider.line);
  // A billing period must provide BOTH dates explicitly; never interpret the date of payment as its start.
  const period=find(/\b(?:billing|service|statement)\s+period\s*[:#-]?\s*((?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2}))\s*(?:to|through|[-–])\s*((?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2}))/i);
  if(period){const start=dateIso(period.match[1]),end=dateIso(period.match[2]);if(start&&end&&start<=end){identified.serviceStart=candidate(start,period.line);identified.serviceEnd=candidate(end,period.line);}}
  const due=find(/\b(?:payment\s+due\s+date|due\s+date|pay\s+by)\s*[:#-]?\s*((?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2}))/i);
  if(due){const dt=dateIso(due.match[1]);if(dt)identified.dueDate=candidate(dt,due.line);}
  const total=find(/^(?:total\s+(?:amount\s+)?due|amount\s+due|new\s+charges|current\s+charges|total\s+bill)\s*[:$\s-]+\$?([\d,]+\.\d{2})\b/i);
  if(total){const amount=positiveNumber(total.match[1],2);if(amount!==null)identified.totalAmount=candidate(amount,total.line);}
  const usage=find(/\b(?:total\s+usage|consumption|usage)\s*[:#-]?\s*([\d,]+(?:\.\d{1,4})?)\s*(kwh|therms?|ccf|mcf|gallons?|gal|gb|mb)\b/i);
  if(usage){const amount=positiveNumber(usage.match[1],4);if(amount!==null){identified.usageAmount=candidate(amount,usage.line);identified.usageUnit=candidate(usage.match[2],usage.line);}}
  const rate=find(/\b(?:rate\s+(?:per\s+unit|per\s+kwh|per\s+therm)|unit\s+rate)\s*[:=$\s-]+\$?([\d,]+\.\d{1,6})\b/i);
  if(rate){const amount=positiveNumber(rate.match[1],6);if(amount!==null)identified.ratePerUnit=candidate(amount,rate.line);}
  if(!identified.serviceStart||!identified.serviceEnd)identified.reviewWarnings.push('Service period missing or unclear; enter both dates manually.');
  if(!identified.totalAmount)identified.reviewWarnings.push('Total due is missing or unclear; do not infer it from subtotals.');
  return identified;
}

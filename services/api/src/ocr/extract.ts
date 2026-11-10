/** Conservative receipt heuristics. All values are UNVERIFIED suggestions. */
export type Candidate = { value: string; evidence: string; confidence: 'low' | 'medium' };
export type ParsedReceipt = {
  receiptType: 'grocery' | 'gas' | 'mixed' | 'unknown';
  merchant: Candidate | null; purchasedOn: Candidate | null; grandTotal: Candidate | null;
  groceryLines: Array<{ description: string; amount: string | null; evidence: string }>;
  gas: { grade: Candidate | null; gallons: Candidate | null; beforeRewardsPricePerGallon: Candidate | null; rewardsDiscountPerGallon: Candidate | null; paidPricePerGallon: Candidate | null };
  reviewWarnings: string[];
};
const money=(v:string):string|null=> { const n=Number(v.replace(/,/g,''));return Number.isFinite(n)&&n>=0&&n<=9999999999.99?n.toFixed(2):null; };
function candidate(value:string,evidence:string,confidence:'low'|'medium'='low'):Candidate {return {value,evidence:evidence.slice(0,240),confidence};}
function matched(lines:string[],re:RegExp):{match:RegExpMatchArray;line:string}|null {for(const line of lines){const match=line.match(re);if(match)return {match,line};}return null;}
export function parseReceiptText(input:string):ParsedReceipt {
  const lines=input.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,350);
  const text=lines.join('\n');
  const gasSignal=/\b(?:fuel|gasoline|diesel|gallons?|\bgal\b|pump\s*#?|price\s*\/\s*gal)\b/i.test(text);
  const groceriesSignal=/\b(?:produce|grocery|groceries|vegetables|cashier|items\s+sold)\b/i.test(text);
  const receiptType=gasSignal&&groceriesSignal?'mixed':gasSignal?'gas':groceriesSignal?'grocery':'unknown';
  const date=matched(lines, /\b(20\d{2})[-\/]([01]?\d)[-\/]([0-3]?\d)\b/)
    ?? matched(lines,/\b([01]?\d)[\/]([0-3]?\d)[\/](20\d{2})\b/);
  let purchasedOn:Candidate|null=null;
  if(date){const m=date.match;const iso=m[1]?.startsWith('20')?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
    const d=new Date(iso+'T00:00:00Z');if(!Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso)purchasedOn=candidate(iso,date.line,'medium');}
  // Only clearly marked totals; do not infer from subtotal, tax or paid-per-gallon.
  const totalMatch=matched(lines,/^(?:grand\s+total|total\s+(?:due|paid)|amount\s+due|total)\s*[:$\s]+\$?([\d,]+\.\d{2})\s*$/i);
  const grandTotal=totalMatch&&money(totalMatch.match[1])!==null?candidate(money(totalMatch.match[1])!,totalMatch.line,'medium'):null;
  const merchantLine=lines.slice(0,8).find(l=>/^[A-Z][\p{L}\p{N}&'.#()\- ]{2,65}$/u.test(l)&&!/^(?:receipt|invoice|customer|welcome|thank you|subtotal|total|date|regular|premium|diesel|fuel|\d)/i.test(l)&&!/(?:\d+[.,]\d{2}|\d{4}[-\/]\d{1,2})/.test(l));
  const gradeMatch=matched(lines,/\b(regular|unleaded|plus|midgrade|super|premium|diesel)\b/i);
  const grade=gradeMatch?candidate(({'unleaded':'Regular','midgrade':'Plus','premium':'Super'} as Record<string,string>)[gradeMatch.match[1].toLowerCase()] ?? (gradeMatch.match[1][0].toUpperCase()+gradeMatch.match[1].slice(1).toLowerCase()),gradeMatch.line):null;
  const gallonsMatch=matched(lines,/\b(?:gallons?|gal|volume)\b\s*[:=]?\s*(\d{1,5}(?:\.\d{1,4})?)\b/i);
  const priceMatch=matched(lines,/(?:before\s+(?:rewards?|discount)|original|regular|posted|pump)\s*(?:price|rate|\$\/gal|per\s+gallon)?\s*[:=]?\s*\$?(\d{1,3}\.\d{2,4})\b/i);
  const discountMatch=matched(lines,/(?:rewards?|loyalty|discount)\s*(?:\/\s*gal|per\s+gallon|\/\s*gallon)?\s*[:=]?\s*\$?(\d{1,3}\.\d{2,4})\b/i);
  const paidMatch=matched(lines,/(?:paid|net)\s*(?:price|rate|per\s+gallon|\/\s*gal)\s*[:=]?\s*\$?(\d{1,3}\.\d{2,4})\b/i);
  const validDecimal=(m:{match:RegExpMatchArray;line:string}|null)=>m&&Number(m.match[1])>0&&Number(m.match[1])<100?candidate(m.match[1],m.line):null;
  const groceryLines:Array<{description:string;amount:string|null;evidence:string}>=[];
  if(receiptType!=='gas')for(const line of lines){
    if(groceryLines.length>=100)break;
    const m=line.match(/^(.{3,90}?)\s+\$?([\d,]+\.\d{2})\s*$/);
    if(!m||/\b(?:total|subtotal|tax|change|cash|card|discount|balance|amount\s+due|tender|savings|paid)\b/i.test(m[1]))continue;
    groceryLines.push({description:m[1].trim(),amount:money(m[2]),evidence:line.slice(0,240)});
  }
  return {receiptType,merchant:merchantLine?candidate(merchantLine,merchantLine):null,purchasedOn,grandTotal,groceryLines,
    gas:{grade,gallons:validDecimal(gallonsMatch),beforeRewardsPricePerGallon:validDecimal(priceMatch),rewardsDiscountPerGallon:discountMatch?candidate(discountMatch.match[1],discountMatch.line):null,paidPricePerGallon:validDecimal(paidMatch)},
    reviewWarnings:['OCR output is unverified; manually confirm all amounts and units',...(gasSignal&&!priceMatch?['Before-rewards price not explicitly identified; do not derive it from paid price']:[]),...(receiptType==='unknown'?['Receipt type unclear; classify manually']:[])]};
}

/** Conservative, client-side mapping of unverified utility OCR suggestions.
 * This module never saves or confirms a bill. Missing values stay blank. */
export const UTILITY_CATEGORIES = [
  'electricity','water','natural_gas','internet','phone','trash','other'
] as const;
export type UtilityCategory = (typeof UTILITY_CATEGORIES)[number];
export type UtilitySuggestion = { value: string; evidence?: string; confidence?: string } | null;
export type UtilityOcrSuggestions = {
  category?: UtilitySuggestion; providerName?: UtilitySuggestion;
  serviceStart?: UtilitySuggestion; serviceEnd?: UtilitySuggestion;
  dueDate?: UtilitySuggestion; totalAmount?: UtilitySuggestion;
  usageAmount?: UtilitySuggestion; usageUnit?: UtilitySuggestion;
  ratePerUnit?: UtilitySuggestion; reviewWarnings?: string[];
};
export type PrefillFields = {
  category?: UtilityCategory; providerName?: string; serviceStart?: string;
  serviceEnd?: string; dueDate?: string; totalAmount?: string;
  usageAmount?: string; usageUnit?: string; ratePerUnit?: string;
};
const isoDate = (s:string) => {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===s;
};
const amount = (s:string, decimals:number) => {
  if(!new RegExp(`^\\d{1,10}(?:\\.\\d{1,${decimals}})?$`).test(s)) return false;
  return Number.isFinite(Number(s)) && Number(s)>=0;
};
export function makeUtilityPrefill(source:UtilityOcrSuggestions|null|undefined):PrefillFields {
  if(!source) return {};
  const result:PrefillFields={};
  const v=(key:keyof UtilityOcrSuggestions)=>{
    const field=source[key];
    return field && !Array.isArray(field) && typeof field==='object' && 'value' in field && typeof field.value==='string' ? field.value.trim() : '';
  };
  const category=v('category');
  if((UTILITY_CATEGORIES as readonly string[]).includes(category)) result.category=category as UtilityCategory;
  const provider=v('providerName');
  if(provider && provider.length<=160)result.providerName=provider;
  const start=v('serviceStart'),end=v('serviceEnd');
  if(isoDate(start)&&isoDate(end)&&start<=end){result.serviceStart=start;result.serviceEnd=end;}
  const due=v('dueDate'); if(isoDate(due))result.dueDate=due;
  for(const [field,precision] of [['totalAmount',2],['usageAmount',4],['ratePerUnit',6]] as const){
    const val=v(field);
    if(val && amount(val,precision))result[field]=val;
  }
  const unit=v('usageUnit');
  if(result.usageAmount && /^[a-zA-Z0-9/ .-]{1,24}$/.test(unit))result.usageUnit=unit;
  return result;
}

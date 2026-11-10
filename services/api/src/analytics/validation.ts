import {id,isoDate,pageParams,invalid} from '../grocery/validation.js';
export function parseGroceryAnalyticsQuery(query:Record<string,unknown>){
  const productId=id(query.productId,'productId')!;
  const variantId=id(query.variantId,'variantId',false);
  const merchantId=id(query.merchantId,'merchantId',false);
  const from=isoDate(query.from,'from');const to=isoDate(query.to,'to');
  if(from&&to&&from>to)invalid('from cannot be after to');
  return {productId,variantId,merchantId,from,to,...pageParams(query)};
}
export type GroceryAnalyticsFilter=ReturnType<typeof parseGroceryAnalyticsQuery>;

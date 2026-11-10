import type {Express,RequestHandler} from 'express';
import type {AuthServices} from '../auth/types.js';
import {createRequireUser,type AuthRequest} from '../auth/routes.js';
import {HttpError} from '../http/errors.js';
import type {AnalyticsStore} from './store.js';
import type {GasStore} from '../gas/store.js';
import {groceryTrend,merchantComparison} from './calculations.js';
import {parseGroceryAnalyticsQuery} from './validation.js';
import {parseGasFilters,parseRankFilters} from '../gas/validation.js';
export function registerAnalyticsRoutes(app:Express,auth:AuthServices,analytics:AnalyticsStore,gas:GasStore):void {
  const guard=createRequireUser(auth);
  const uid=(req:AuthRequest)=>req.authenticatedUser!.id;
  const wrap=(fn:(req:AuthRequest)=>Promise<unknown>):RequestHandler=>async(req,res)=>res.json({ok:true,data:await fn(req as AuthRequest)});
  async function grocery(req:AuthRequest) {
    const filters=parseGroceryAnalyticsQuery(req.query);
    const rows=await analytics.grocery(uid(req),filters);
    if(rows===null)throw new HttpError(404,'PRODUCT_NOT_FOUND','Product not found');
    return {filters,rows};
  }
  app.get('/api/analytics/grocery/trends',guard,wrap(async req=>{
    const {filters,rows}=await grocery(req);
    return {productId:filters.productId,observations:groceryTrend(rows),pagination:{limit:filters.limit,offset:filters.offset,hasMore:rows.length===filters.limit},
      note:'Only confirmed transactions and confirmed lines; units not converted when unknown'};
  }));
  app.get('/api/analytics/grocery/merchants',guard,wrap(async req=>{
    const {filters,rows}=await grocery(req);
    return {productId:filters.productId,merchants:merchantComparison(rows),
      pagination:{limit:filters.limit,offset:filters.offset,hasMore:rows.length===filters.limit},
      note:'Summaries represent the selected page of confirmed price observations only; compare matching basis values; null merchants are unassigned'};
  }));
  // Dashboard sections follow the agreed gas-screen order; all data remains user-scoped.
  app.get('/api/analytics/gas/dashboard',guard,wrap(async req=>{
    const filter=parseGasFilters(req.query);
    const rankFilter=parseRankFilters(req.query);
    const user=uid(req);
    const [settings,rankings,recordedEntries,purchases,chartHistory,impact]=await Promise.all([
      gas.settings(user),gas.rankings(user,rankFilter),gas.list(user,filter),gas.list(user,filter),gas.history(user,filter),gas.impact(user)
    ]);
    if(!settings)throw new HttpError(404,'SETTINGS_NOT_FOUND','Settings not found');
    return {
      fuelAssumptions:settings,
      priceIncreaseRankings:rankings,
      allRecordedGasEntries:recordedEntries,
      allGasPurchases:purchases,
      confirmedChartHistory:chartHistory,
      costImpact:impact,
      pagination:{limit:filter.limit,offset:filter.offset,hasMore:(recordedEntries as unknown[]).length===filter.limit},
      note:'Purchase lists are paginated and may contain drafts; chart and rankings use verified before-rewards prices only'
    };
  }));
}

import type { Express, RequestHandler } from 'express';
import type { AuthServices } from '../auth/types.js';
import { createRequireUser, type AuthRequest } from '../auth/routes.js';
import { HttpError } from '../http/errors.js';
import type { GasStore } from './store.js';
import { parseGasPurchase,parseGasUpdate,parseGasFilters,parseRankFilters,parseAssumptions,parseGasId } from './validation.js';

export function registerGasRoutes(app:Express,auth:AuthServices,gas:GasStore):void {
  const guard=createRequireUser(auth);
  const uid=(req:AuthRequest)=>req.authenticatedUser!.id;
  const wrap=(fn:(req:AuthRequest)=>Promise<unknown>,status=200):RequestHandler=>async(req,res)=>{
    const data=await fn(req as AuthRequest);res.status(status).json({ok:true,data});
  };
  // All endpoints including global grade metadata require authentication for consistency.
  app.get('/api/gas/grades',guard,wrap(()=>gas.grades()));
  app.get('/api/gas/settings',guard,wrap(async req=>{
    const settings=await gas.settings(uid(req));if(!settings)throw new HttpError(404,'SETTINGS_NOT_FOUND','Settings not found');return settings;
  }));
  app.patch('/api/gas/settings',guard,wrap(req=>gas.updateSettings(uid(req),parseAssumptions(req.body))));
  app.get('/api/gas/history',guard,wrap(req=>gas.history(uid(req),parseGasFilters(req.query))));
  app.get('/api/gas/rankings',guard,wrap(req=>gas.rankings(uid(req),parseRankFilters(req.query))));
  app.get('/api/gas/impact',guard,wrap(req=>gas.impact(uid(req))));
  app.get('/api/gas/purchases',guard,wrap(req=>gas.list(uid(req),parseGasFilters(req.query))));
  app.post('/api/gas/purchases',guard,wrap(req=>gas.create(uid(req),parseGasPurchase(req.body)),201));
  app.get('/api/gas/purchases/:gasId',guard,wrap(async req=>{
    const data=await gas.get(uid(req),parseGasId(req.params.gasId,'gasId'));
    if(!data)throw new HttpError(404,'GAS_PURCHASE_NOT_FOUND','Gas purchase not found');return data;
  }));
  app.put('/api/gas/purchases/:gasId',guard,wrap(req=>gas.update(uid(req),parseGasId(req.params.gasId,'gasId'),parseGasUpdate(req.body))));
}

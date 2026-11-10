import type { Express } from 'express';
import { createRequireUser, type AuthRequest } from '../auth/routes.js';
import type { AuthServices } from '../auth/types.js';
import { HttpError } from '../http/errors.js';
import { receiptId } from '../receipts/validation.js';
import type { ReviewStore } from './store.js';
import { parseReviewDraft, parseRevision, requireAcknowledgement } from './validation.js';

export function registerReviewRoutes(app:Express, auth:AuthServices, store:ReviewStore):void {
  const authenticate=createRequireUser(auth);
  app.get('/api/receipts/:receiptId/review',authenticate,async(req,res)=>{
    const owner=(req as AuthRequest).authenticatedUser!.id, id=receiptId(req.params.receiptId);
    const review=await store.get(owner,id);
    if(!review)throw new HttpError(404,'RECEIPT_NOT_FOUND','Receipt not found');
    res.setHeader('Cache-Control','private, no-store');
    res.json({ok:true,data:review});
  });
  app.put('/api/receipts/:receiptId/review',authenticate,async(req,res)=>{
    const owner=(req as AuthRequest).authenticatedUser!.id, id=receiptId(req.params.receiptId);
    const body=req.body as Record<string,unknown>;
    const expectedRevision=parseRevision(body?.expectedRevision);
    const draft=parseReviewDraft(body?.draft);
    const review=await store.save(owner,id,draft,expectedRevision);
    res.setHeader('Cache-Control','private, no-store');
    res.json({ok:true,data:review});
  });
  app.post('/api/receipts/:receiptId/review/confirm',authenticate,async(req,res)=>{
    const owner=(req as AuthRequest).authenticatedUser!.id, id=receiptId(req.params.receiptId);
    const body=req.body as Record<string,unknown>;
    requireAcknowledgement(body?.acknowledged);
    const revision=parseRevision(body?.expectedRevision);
    if(!revision)throw new HttpError(400,'VALIDATION_ERROR','expectedRevision is required');
    const result=await store.confirm(owner,id,revision);
    res.status(201).setHeader('Cache-Control','private, no-store');
    res.json({ok:true,data:result});
  });
}

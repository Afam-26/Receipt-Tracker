import type { Express } from 'express';
import { createRequireUser, type AuthRequest } from '../auth/routes.js';
import type { AuthServices } from '../auth/types.js';
import { HttpError } from '../http/errors.js';
import { receiptId } from '../receipts/validation.js';
import type { OcrStore } from './store.js';

export function registerOcrRoutes(app:Express,auth:AuthServices,ocr:OcrStore):void {
  const authenticate=createRequireUser(auth);
  app.post('/api/receipts/:receiptId/ocr',authenticate,async(req,res)=>{
    const id=receiptId(req.params.receiptId),userId=(req as AuthRequest).authenticatedUser!.id;
    const status=await ocr.enqueue(userId,id);
    if(status==='not_found')throw new HttpError(404,'RECEIPT_NOT_FOUND','Receipt not found');
    if(status==='busy')throw new HttpError(409,'RECEIPT_NOT_READY_FOR_OCR','Receipt has active or reviewed extraction');
    res.status(202).json({ok:true,data:{receiptId:id,jobId:status,status:'queued'}});
  });
  app.get('/api/receipts/:receiptId/ocr',authenticate,async(req,res)=>{
    const id=receiptId(req.params.receiptId),userId=(req as AuthRequest).authenticatedUser!.id;
    const status=await ocr.status(userId,id);
    if(!status)throw new HttpError(404,'RECEIPT_NOT_FOUND','Receipt not found');
    res.setHeader('Cache-Control','private, no-store');
    res.json({ok:true,data:status});
  });
}

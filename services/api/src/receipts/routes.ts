import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import express from 'express';
import { pipeline } from 'node:stream/promises';
import { createRequireUser, type AuthRequest } from '../auth/routes.js';
import type { AuthServices } from '../auth/types.js';
import { HttpError } from '../http/errors.js';
import type { ReceiptObjectStorage } from './storage.js';
import type { ReceiptStore } from './store.js';
import { MAX_RECEIPT_BYTES, parseFilename, parseLimit, parseOffset, parseReceiptType, receiptId, validateReceiptImage } from './validation.js';

export type ReceiptServices={store:ReceiptStore;storage:ReceiptObjectStorage};
export function registerReceiptRoutes(app:Express,auth:AuthServices,services:ReceiptServices):void {
  const requireUser=createRequireUser(auth);
  const owner=(req:AuthRequest)=>req.authenticatedUser!.id;
  const raw=express.raw({type:()=>true,limit:MAX_RECEIPT_BYTES,inflate:false});
  const wrap=(fn:(req:AuthRequest)=>Promise<unknown>,status=200):RequestHandler=>async(req,res)=>{res.status(status).json({ok:true,data:await fn(req as AuthRequest)});};

  // Opaque receipt upload, not JSON/base64. Authenticate BEFORE reading 10 MiB of bytes.
  app.post('/api/receipts',requireUser,raw,async(req,res)=>{
    const userId=owner(req as AuthRequest);
    const receiptType=parseReceiptType(req.header('x-receipt-type'));
    const filename=parseFilename(req.header('x-receipt-filename'));
    const image=validateReceiptImage(req.body,req.header('content-type'));
    const ext=image.mimeType==='image/jpeg'?'jpg':image.mimeType==='image/png'?'png':image.mimeType==='image/webp'?'webp':'pdf';
    // No user filenames or sequential IDs in bucket keys. R2 bucket must remain private.
    const key=`receipts/${userId}/${randomUUID()}.${ext}`;
    try{await services.storage.put(key,image.bytes,image.mimeType,image.sha256);}
    catch{throw new HttpError(503,'STORAGE_UNAVAILABLE','Receipt storage temporarily unavailable');}
    try{
      const saved=await services.store.create(userId,receiptType,filename,image,key);
      res.status(201).json({ok:true,data:{...saved,processingStatus:'uploaded',sha256:image.sha256,mimeType:image.mimeType,byteSize:image.bytes.length}});
    }catch(error){
      // Best-effort cleanup of the unreferenced object. Failure must be logged for reconciliation.
      try{await services.storage.delete(key);}catch{console.error('Receipt object cleanup failed; reconcile orphaned upload');}
      if(error instanceof HttpError)throw error;
      throw new HttpError(503,'RECEIPT_PERSISTENCE_FAILED','Could not save receipt metadata');
    }
  });

  app.get('/api/receipts',requireUser,wrap(req=>services.store.list(owner(req),parseLimit(req.query.limit),parseOffset(req.query.offset))));
  app.get('/api/receipts/:receiptId',requireUser,wrap(async req=>{
    const result=await services.store.get(owner(req),receiptId(req.params.receiptId));
    if(!result)throw new HttpError(404,'RECEIPT_NOT_FOUND','Receipt not found');
    return result;
  }));
  app.get('/api/receipts/:receiptId/files/:fileId/download',requireUser,async(req,res)=>{
    const receipt=receiptId(req.params.receiptId),fileId=receiptId(req.params.fileId);
    const file=await services.store.file(owner(req as AuthRequest),receipt,fileId);
    if(!file)throw new HttpError(404,'RECEIPT_FILE_NOT_FOUND','Receipt file not found');
    let object;
    try{object=await services.storage.get(file.key);}
    catch{throw new HttpError(503,'STORAGE_UNAVAILABLE','Receipt storage temporarily unavailable');}
    res.setHeader('Content-Type',file.mimeType);
    res.setHeader('Content-Disposition',`attachment; filename="receipt"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    await pipeline(object.body,res);
  });
}

import { useAuth } from '@clerk/expo';
import { useCallback, useEffect, useRef } from 'react';
import { File as ExpoFile } from 'expo-file-system';
import { createApiClient, ApiError } from './api';
import { mobileConfig, validateApiBase } from './config';

export type ApiEnvelope<T> = { ok: true; data: T };
export type ReceiptType = 'grocery' | 'gas'; // Purchase confirmation remains limited to grocery/gas.
export type ReceiptMeta = {
  id: string; receiptType: string; processingStatus: string; createdAt: string;
  files: { id: string; originalFilename: string; mimeType: string }[];
};
export type OcrCandidate = { value: string; evidence: string; confidence: string } | null;
export type UtilityCandidate = {value:string;evidence:string;confidence:string}|null;
export type UtilityExtract = {category:UtilityCandidate;providerName:UtilityCandidate;serviceStart:UtilityCandidate;serviceEnd:UtilityCandidate;dueDate:UtilityCandidate;totalAmount:UtilityCandidate;usageAmount:UtilityCandidate;usageUnit:UtilityCandidate;ratePerUnit:UtilityCandidate;reviewWarnings:string[]};
export type OcrExtract = {utility?:UtilityExtract|null;
  receiptType: string; merchant: OcrCandidate; purchasedOn: OcrCandidate; grandTotal: OcrCandidate;
  groceryLines: { description: string; amount: string | null; evidence: string }[];
  gas: { grade: OcrCandidate; gallons: OcrCandidate; beforeRewardsPricePerGallon: OcrCandidate;
    rewardsDiscountPerGallon: OcrCandidate; paidPricePerGallon: OcrCandidate };
  reviewWarnings: string[];
};
export type OcrStatus = { processingStatus: string; jobStatus: string | null; attempts: number | null;
  extraction: { id: string; data: OcrExtract } | null };
export type GroceryLine = { rawDescription: string; variantId: string | null; quantityPurchased: string | null;
  measurementUnit: string | null; measuredAmount: string | null; listedUnitPrice: string | null;
  grossLineTotal: string | null; netLineTotal: string | null };
export type GasReview = { fuelGradeId: string | null; rawFuelGrade: string | null;
  regularPricePerGallon: string | null; rewardDiscountPerGallon: string | null;
  paidPricePerGallon: string | null; gallons: string | null; totalPaid: string | null;
  priceSource: 'unknown' | 'printed' | 'confirmed' };
export type ReviewDraft = { extractionId: string; receiptType: ReceiptType;
  purchasedOn: string | null; merchantId: string | null; grandTotal: string | null;
  items: GroceryLine[]; gas: GasReview | null };
export type ReviewState = { receiptId: string; status: string;
  extraction: { id: string; data: OcrExtract } | null;
  draft: ReviewDraft | null; revision: string | null };

export function initialDraft(extraction: NonNullable<ReviewState['extraction']>): ReviewDraft {
  const raw = extraction.data;
  const receiptType: ReceiptType = raw.receiptType === 'gas' ? 'gas' : 'grocery';
  return {
    extractionId: extraction.id, receiptType,
    purchasedOn: raw.purchasedOn?.value ?? null, merchantId: null,
    grandTotal: raw.grandTotal?.value ?? null,
    items: receiptType === 'grocery' ? (raw.groceryLines ?? []).map(line => ({
      rawDescription: line.description, variantId: null, quantityPurchased: null,
      measurementUnit: null, measuredAmount: null, listedUnitPrice: null,
      grossLineTotal: null, netLineTotal: line.amount ?? null,
    })) : [],
    gas: receiptType === 'gas' ? {
      fuelGradeId: null, rawFuelGrade: raw.gas?.grade?.value ?? null,
      regularPricePerGallon: raw.gas?.beforeRewardsPricePerGallon?.value ?? null,
      rewardDiscountPerGallon: raw.gas?.rewardsDiscountPerGallon?.value ?? null,
      paidPricePerGallon: raw.gas?.paidPricePerGallon?.value ?? null,
      gallons: raw.gas?.gallons?.value ?? null, totalPaid: raw.grandTotal?.value ?? null,
      priceSource: 'unknown',
    } : null,
  };
}

export function useReceiptApi() {
  const { getToken } = useAuth();
  const ref = useRef(getToken);
  useEffect(() => { ref.current = getToken; }, [getToken]);
  return useCallback(async <T,>(path: string, method: 'GET'|'POST'|'PUT' = 'GET', payload?: unknown): Promise<T> => {
    if (!/^\/api\/[A-Za-z0-9/?=&._%+~-]+$/.test(path)) throw new Error('Invalid API path');
    if (method === 'GET') return createApiClient(() => ref.current())<T>(path);
    const token = await ref.current();
    if (!token) throw new ApiError(401, 'AUTH_REQUIRED', 'Please sign in again.');
    const res = await fetch(`${validateApiBase(mobileConfig.apiBase)}${path}`, {
      method, headers: {Authorization:`Bearer ${token}`, Accept:'application/json', 'Content-Type':'application/json'},
      body: JSON.stringify(payload ?? {}),
    });
    const body: any = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'REQUEST_FAILED',
      res.status >= 500 ? 'Service temporarily unavailable.' : (body?.error?.message ?? `Request failed (${res.status})`));
    return body as T;
  }, []);
}

export type SelectedReceipt = { uri: string; fileName?: string | null; mimeType?: string | null; fileSize?: number | null };
export function useUploadReceipt() {
  const { getToken } = useAuth();
  const ref = useRef(getToken);
  useEffect(() => { ref.current = getToken; }, [getToken]);
  return useCallback(async (asset: SelectedReceipt, receiptType: 'grocery'|'gas'|'utility'|'unknown'): Promise<{receiptId:string}> => {
    const file = new ExpoFile(asset.uri);
    const mime = (asset.mimeType ?? file.type ?? '').toLowerCase();
    if (!['image/jpeg','image/png','image/webp'].includes(mime))
      throw new Error('Please select a JPEG, PNG or WebP image. HEIC photos must be converted to JPEG.');
    if (file.size < 1 || file.size > 10*1024*1024)
      throw new Error('Receipt must be between 1 byte and 10 MB.');
    const token = await ref.current();
    if (!token) throw new Error('Sign in before uploading.');
    const filename = (asset.fileName ?? `receipt-${Date.now()}.${mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'}`)
      .replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 200);
    const response = await fetch(`${validateApiBase(mobileConfig.apiBase)}/api/receipts`, {
      method: 'POST',
      headers: { Authorization:`Bearer ${token}`, 'Content-Type':mime,
        'X-Receipt-Type':receiptType, 'X-Receipt-Filename':filename },
      body: file as unknown as BodyInit,
    });
    const body: any = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, body?.error?.code ?? 'UPLOAD_FAILED',
      response.status >= 500 ? 'Upload service unavailable.' : (body?.error?.message ?? 'Upload failed.'));
    const receiptId = String(body?.data?.receiptId ?? '');
    if (!/^[1-9]\d*$/.test(receiptId)) throw new Error('Upload response had no receipt identifier');
    return {receiptId};
  }, []);
}

export function validateDraftLocally(d: ReviewDraft): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.purchasedOn ?? '') ||
    Number.isNaN(new Date(`${d.purchasedOn}T00:00:00Z`).getTime())) return 'Enter a valid purchase date (YYYY-MM-DD).';
  const nonnegative = (s:string|null, precision:number) => s !== null &&
    new RegExp(`^\\d{1,10}(?:\\.\\d{1,${precision}})?$`).test(s);
  if (!nonnegative(d.grandTotal,2)) return 'Enter the receipt grand total (up to 2 decimal places).';
  if (d.receiptType === 'grocery') {
    if (!d.items.length) return 'Add at least one grocery item.';
    for (const [i, item] of d.items.entries()) {
      if (!item.rawDescription.trim() || !item.variantId || !/^[1-9]\d*$/.test(item.variantId) ||
          !nonnegative(item.quantityPurchased,4) || Number(item.quantityPurchased) <= 0 || !nonnegative(item.netLineTotal,2))
        return `Item ${i+1}: enter a description, owned variant ID, quantity and net total.`;
    }
  } else {
    const g = d.gas;
    if (!g || !g.fuelGradeId || !/^[1-9]\d*$/.test(g.fuelGradeId) ||
      !nonnegative(g.regularPricePerGallon,4) || !nonnegative(g.gallons,4) || Number(g.gallons) <= 0 ||
      !nonnegative(g.paidPricePerGallon,4) || !nonnegative(g.totalPaid,2) || g.priceSource === 'unknown')
      return 'Gas requires a fuel grade, verified before-rewards price, paid price, gallons, total and price source.';
  }
  return null;
}

import { createHash } from 'node:crypto';
import { HttpError } from '../http/errors.js';

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
export type ReceiptType = 'grocery' | 'gas' | 'utility' | 'mixed' | 'unknown';
export type ReceiptImage = { bytes: Buffer; mimeType: 'image/jpeg'|'image/png'|'image/webp'|'application/pdf'; sha256: string };

export function receiptId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 18446744073709551615n) {
    throw new HttpError(400, 'INVALID_RECEIPT_ID', 'Invalid receipt identifier');
  }
  return value;
}
export function parseReceiptType(value: unknown): ReceiptType {
  if (value === undefined) return 'unknown';
  if (typeof value !== 'string' || !['grocery','gas','utility','mixed','unknown'].includes(value)) {
    throw new HttpError(400, 'INVALID_RECEIPT_TYPE', 'Invalid receipt type');
  }
  return value as ReceiptType;
}
export function parseFilename(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 255 || /[\\/\x00-\x1f\x7f]/.test(value)) {
    throw new HttpError(400, 'INVALID_FILENAME', 'Provide a simple filename of up to 255 characters');
  }
  return value.trim();
}
export function sniffMime(bytes: Buffer): ReceiptImage['mimeType'] | null {
  if (bytes.length >= 3 && bytes.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff]))) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP') return 'image/webp';
  if (bytes.length >= 5 && bytes.toString('ascii',0,5)==='%PDF-') return 'application/pdf';
  return null;
}
export function validateReceiptImage(value: unknown, declaredMime: string | undefined): ReceiptImage {
  if (!Buffer.isBuffer(value) || value.length === 0) throw new HttpError(400,'EMPTY_FILE','Receipt file is required');
  if (value.length > MAX_RECEIPT_BYTES) throw new HttpError(413,'PAYLOAD_TOO_LARGE','Receipt exceeds 10 MiB');
  const detected=sniffMime(value);
  if (!detected) throw new HttpError(415,'UNSUPPORTED_FILE','Only JPEG, PNG, WebP, or PDF receipts are supported');
  if (declaredMime?.toLowerCase().split(';')[0].trim() !== detected) {
    throw new HttpError(415,'FILE_TYPE_MISMATCH','File content does not match Content-Type');
  }
  return {bytes:value,mimeType:detected,sha256:createHash('sha256').update(value).digest('hex')};
}
export function parseLimit(value: unknown): number {
  if (value===undefined) return 25;
  if (typeof value!=='string' || !/^[1-9][0-9]{0,2}$/.test(value)) throw new HttpError(400,'INVALID_LIMIT','Limit must be 1–100');
  const n=Number(value);if(n>100) throw new HttpError(400,'INVALID_LIMIT','Limit must be 1–100');return n;
}
export function parseOffset(value: unknown): number {
  if (value===undefined) return 0;
  if (typeof value!=='string' || !/^(0|[1-9][0-9]{0,8})$/.test(value)) throw new HttpError(400,'INVALID_OFFSET','Invalid offset');
  return Number(value);
}

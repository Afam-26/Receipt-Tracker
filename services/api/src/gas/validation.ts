import { HttpError } from '../http/errors.js';
import { object, id, decimal, isoDate, string, enumValue, pageParams, invalid } from '../grocery/validation.js';

export type GasStatus = 'draft' | 'needs_review' | 'confirmed';
export type PriceSource = 'printed' | 'derived' | 'confirmed' | 'unknown';
export const statusValues = ['draft','needs_review','confirmed'] as const;
const priceSourceValues = ['printed','derived','confirmed','unknown'] as const;

export function parseGasPurchase(body: unknown) {
  const b = object(body);
  const status = enumValue(b.status, 'status', statusValues, 'needs_review');
  const priceSource = enumValue(b.priceSource, 'priceSource', priceSourceValues, 'unknown');
  const purchasedOn = isoDate(b.purchasedOn, 'purchasedOn');
  const fuelGradeId = id(b.fuelGradeId, 'fuelGradeId', false);
  const regularPricePerGallon = decimal(b.regularPricePerGallon, 'regularPricePerGallon', 4, 10);
  const rewardDiscountPerGallon = decimal(b.rewardDiscountPerGallon, 'rewardDiscountPerGallon', 4, 10);
  const paidPricePerGallon = decimal(b.paidPricePerGallon, 'paidPricePerGallon', 4, 10);
  const gallons = decimal(b.gallons, 'gallons', 4, 12, false, true);
  const totalPaid = decimal(b.totalPaid, 'totalPaid', 2, 12);
  const sourceTransactionId = string(b.sourceTransactionId, 'sourceTransactionId', 191)!;
  const receiptId = id(b.receiptId, 'receiptId', false);
  const merchantId = id(b.merchantId, 'merchantId', false);
  const rawFuelGrade = string(b.rawFuelGrade, 'rawFuelGrade', 128, false);
  if (regularPricePerGallon !== null && priceSource === 'unknown') invalid('A known regular price requires a priceSource');
  if (regularPricePerGallon === null && priceSource !== 'unknown') invalid('priceSource must be unknown when regular price is missing');
  if (priceSource === 'derived' && (rewardDiscountPerGallon === null || paidPricePerGallon === null)) invalid('Derived regular price requires printed paid price and reward');
  if (status === 'confirmed' && (!purchasedOn || !fuelGradeId || regularPricePerGallon === null || Number(regularPricePerGallon) <= 0 || !gallons || totalPaid === null || priceSource === 'unknown')) {
    invalid('Confirmed gas purchases require date, verified fuel grade, before-rewards price, gallons and total');
  }
  if (regularPricePerGallon !== null && paidPricePerGallon !== null && rewardDiscountPerGallon !== null) {
    // Arithmetic using integer ten-thousandths prevents floating-point price discrepancies.
    const m = (s: string) => { const [whole, frac = ''] = s.split('.'); return BigInt(whole) * 10000n + BigInt(frac.padEnd(4, '0')); };
    if (m(paidPricePerGallon) + m(rewardDiscountPerGallon) !== m(regularPricePerGallon)) {
      invalid('Paid price plus rewards must equal before-rewards price');
    }
  }
  return { sourceTransactionId, purchasedOn, merchantId, receiptId, status, fuelGradeId, rawFuelGrade,
    regularPricePerGallon, rewardDiscountPerGallon, paidPricePerGallon, gallons, totalPaid, priceSource };
}
export function parseGasUpdate(body: unknown) {
  // Same validation contract as creation, including the same immutable transaction key.
  return parseGasPurchase(body);
}
export function parseGasFilters(query: Record<string, unknown>) {
  const { limit, offset } = pageParams(query);
  const from = isoDate(query.from, 'from'); const to = isoDate(query.to, 'to');
  if (from && to && from > to) invalid('from must not be after to');
  return { limit, offset, from, to, merchantId: id(query.merchantId, 'merchantId', false),
    fuelGradeId: id(query.fuelGradeId, 'fuelGradeId', false) };
}
export function parseRankFilters(query: Record<string, unknown>) {
  const f = parseGasFilters(query);
  const mode = enumValue(query.mode, 'mode', ['previous','lowest'] as const, 'previous');
  return { ...f, mode };
}
export function parseAssumptions(body: unknown) {
  const b = object(body);
  // Up to 9999 gallons, up to 100 fills/week; zero fill-ups is allowed.
  const gallonsPerFillup = decimal(b.gallonsPerFillup, 'gallonsPerFillup', 4, 8, true, true)!;
  const fillsPerWeek = decimal(b.fillsPerWeek, 'fillsPerWeek', 4, 7, true)!;
  if (Number(fillsPerWeek) > 100) invalid('fillsPerWeek must not exceed 100');
  return { gallonsPerFillup, fillsPerWeek };
}
export function parseGasId(value: unknown, name: string) { return id(value, name)!; }
export function unavailable(message: string): never { throw new HttpError(409, 'REVIEW_REQUIRED', message); }

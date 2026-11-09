import { HttpError } from '../http/errors.js';

export function invalid(message: string): never { throw new HttpError(400, 'VALIDATION_ERROR', message); }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('Expected an object');
  return value as Record<string, unknown>;
}
export function string(value: unknown, name: string, max: number, required = true): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) invalid(`${name} is required`);
    return null;
  }
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) invalid(`Invalid ${name}`);
  return value.trim();
}
export function id(value: unknown, name: string, required = true): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) invalid(`${name} is required`);
    return null;
  }
  if (typeof value !== 'string' && typeof value !== 'number') invalid(`Invalid ${name}`);
  const text = String(value);
  if (!/^[1-9]\d{0,19}$/.test(text) || BigInt(text) > 18446744073709551615n) invalid(`Invalid ${name}`);
  return text;
}
export function decimal(value: unknown, name: string, scale: number, precision: number, required = false, positive = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) invalid(`${name} is required`);
    return null;
  }
  if (typeof value !== 'string' && typeof value !== 'number') invalid(`Invalid ${name}`);
  const s = String(value);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!match || match[1].length > precision - scale || (match[2]?.length ?? 0) > scale || (positive && !/[1-9]/.test(s))) invalid(`Invalid ${name}`);
  return s;
}
export function isoDate(value: unknown, name: string, required = false): string | null {
  const d = string(value, name, 10, required);
  if (d === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) invalid(`Invalid ${name}`);
  const test = new Date(`${d}T12:00:00.000Z`);
  if (Number.isNaN(test.getTime()) || test.toISOString().slice(0, 10) !== d) invalid(`Invalid ${name}`);
  return d;
}
export function enumValue<T extends string>(value: unknown, name: string, choices: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !choices.includes(value as T)) invalid(`Invalid ${name}`);
  return value as T;
}
export function pageParams(query: Record<string, unknown>) {
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) invalid('Invalid pagination');
  return { limit, offset };
}
export function parseCategory(body: unknown) {
  const b = object(body);
  return { name: string(b.name, 'name', 191)!, parentId: id(b.parentId, 'parentId', false) };
}
export function parseProduct(body: unknown) {
  const b = object(body);
  return {
    canonicalName: string(b.canonicalName, 'canonicalName', 255)!,
    brand: string(b.brand, 'brand', 191, false), categoryId: id(b.categoryId, 'categoryId', false),
  };
}
export function parseVariant(body: unknown) {
  const b = object(body);
  return {
    productId: id(b.productId, 'productId')!, variantName: string(b.variantName, 'variantName', 255)!,
    packageQuantity: decimal(b.packageQuantity, 'packageQuantity', 4, 12, false, true),
    packageUnit: string(b.packageUnit, 'packageUnit', 32, false),
    unitCount: decimal(b.unitCount, 'unitCount', 4, 12, false, true),
    productCode: string(b.productCode, 'productCode', 128, false),
    comparisonGroup: string(b.comparisonGroup, 'comparisonGroup', 128, false),
  };
}
export function parsePurchase(body: unknown) {
  const b = object(body);
  // Must be a stable idempotency key on every manual transaction. The MySQL UNIQUE index enforces it.
  const sourceTransactionId = string(b.sourceTransactionId, 'sourceTransactionId', 191)!;
  const items = b.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) invalid('items must contain 1 to 100 entries');
  const parsed = items.map((item: unknown, index: number) => {
    const row = object(item);
    return {
      receiptLineNumber: index + 1,
      rawDescription: string(row.rawDescription, 'rawDescription', 512)!,
      variantId: id(row.variantId, 'variantId', false),
      quantityPurchased: decimal(row.quantityPurchased, 'quantityPurchased', 4, 12, false, true),
      measurementUnit: string(row.measurementUnit, 'measurementUnit', 32, false),
      measuredAmount: decimal(row.measuredAmount, 'measuredAmount', 4, 12, false, true),
      listedUnitPrice: decimal(row.listedUnitPrice, 'listedUnitPrice', 4, 12),
      grossLineTotal: decimal(row.grossLineTotal, 'grossLineTotal', 2, 12),
      netLineTotal: decimal(row.netLineTotal, 'netLineTotal', 2, 12),
    };
  });
  const status = enumValue(b.status, 'status', ['draft', 'needs_review', 'confirmed'] as const, 'needs_review');
  // Strict: confirmed records require enough fields for meaningful price history.
  if (status === 'confirmed' && (parsed.some(x => !x.variantId || !x.quantityPurchased || !x.netLineTotal) || !b.purchasedOn)) {
    invalid('Confirmed purchases require a date and every item to have a variant, quantity and net total');
  }
  return {
    sourceTransactionId, purchasedOn: isoDate(b.purchasedOn, 'purchasedOn'),
    merchantId: id(b.merchantId, 'merchantId', false), receiptId: id(b.receiptId, 'receiptId', false),
    status, subtotal: decimal(b.subtotal, 'subtotal', 2, 12), taxTotal: decimal(b.taxTotal, 'taxTotal', 2, 12),
    discountTotal: decimal(b.discountTotal, 'discountTotal', 2, 12), grandTotal: decimal(b.grandTotal, 'grandTotal', 2, 12),
    items: parsed,
  };
}
export function parseList(query: Record<string, unknown>) {
  const paging = pageParams(query);
  const from = isoDate(query.from, 'from'); const to = isoDate(query.to, 'to');
  if (from && to && from > to) invalid('from must not be after to');
  return { ...paging, search: string(query.search, 'search', 120, false),
    categoryId: id(query.categoryId, 'categoryId', false), productId: id(query.productId, 'productId', false),
    merchantId: id(query.merchantId, 'merchantId', false), variantId: id(query.variantId, 'variantId', false),
    from, to };
}

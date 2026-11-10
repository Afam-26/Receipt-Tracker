/** Exact decimal arithmetic: no floating point money math. Signed amounts represent savings. */
function scaled(value: string, scale: number): bigint {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error('Invalid decimal');
  const neg = value.startsWith('-'); const [whole, fraction = ''] = (neg ? value.slice(1) : value).split('.');
  if (fraction.length > scale) throw new Error('Excess precision');
  const result = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0'));
  return neg ? -result : result;
}
function roundedDivide(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new Error('Invalid denominator');
  const negative = n < 0n; const abs = negative ? -n : n;
  const result = (abs + d / 2n) / d;
  return negative ? -result : result;
}
function formatted(n: bigint, scale: number): string {
  const neg = n < 0n; const abs = neg ? -n : n; const base = 10n ** BigInt(scale);
  return `${neg ? '-' : ''}${abs / base}.${String(abs % base).padStart(scale, '0')}`;
}
export type PriceObservation = {
  id: string; transactionId: string; purchasedOn: string; fuelGradeId: string;
  regularPricePerGallon: string; gallons: string | null; totalPaid: string | null;
  rewardDiscountPerGallon: string | null; paidPricePerGallon: string | null;
  merchantId: string | null; receiptId: string | null; rawFuelGrade: string | null;
  priceSource: 'printed' | 'derived' | 'confirmed';
};
export type Assumptions = { gallonsPerFillup: string; fillsPerWeek: string };
export function calculateImpact(previous: string, latest: string, assumptions: Assumptions) {
  const delta = scaled(latest,4) - scaled(previous,4);
  const prev = scaled(previous,4);
  const gallons = scaled(assumptions.gallonsPerFillup,4);
  const fills = scaled(assumptions.fillsPerWeek,4);
  const perFillup = roundedDivide(delta * gallons, 1000000n); // scale 8 -> cents
  const annual = roundedDivide(delta * gallons * fills * 52n, 10000000000n); // scale 12 -> cents
  const monthly = roundedDivide(delta * gallons * fills * 52n, 120000000000n);
  const percent = prev === 0n ? null : formatted(roundedDivide(delta * 1000000n, prev),4); // percentage to four decimals
  return { previousGasPrice: previous, newGasPrice: latest, increasePerGallon: formatted(delta,4),
    percentageIncrease: percent, extraCostPerFillup: formatted(perFillup,2),
    estimatedMonthlyExtraCost: formatted(monthly,2), estimatedAnnualExtraCost: formatted(annual,2) };
}
function ordered(observations: PriceObservation[]): PriceObservation[] {
  return observations.slice().sort((a,b) => a.purchasedOn.localeCompare(b.purchasedOn) ||
    (BigInt(a.transactionId) < BigInt(b.transactionId) ? -1 : BigInt(a.transactionId) > BigInt(b.transactionId) ? 1 : 0) ||
    (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0));
}
export function getRankings(observations: PriceObservation[], assumptions: Assumptions, mode: 'previous'|'lowest') {
  const grades = new Map<string,PriceObservation[]>();
  for (const item of ordered(observations)) {
    const g = grades.get(item.fuelGradeId) ?? []; g.push(item); grades.set(item.fuelGradeId,g);
  }
  const results: Array<Record<string,unknown>> = [];
  for (const [fuelGradeId, items] of grades) {
    let lowest: PriceObservation | null = null;
    for (let i=0;i<items.length;i++) {
      const current = items[i];
      const baseline = mode === 'previous' ? (items[i-1] ?? null) : lowest;
      if (baseline) {
        const impact = calculateImpact(baseline.regularPricePerGallon, current.regularPricePerGallon, assumptions);
        if (scaled(impact.increasePerGallon,4) > 0n) results.push({ fuelGradeId, previousPurchaseId: baseline.id,
          newPurchaseId: current.id, previousDate: baseline.purchasedOn, newDate: current.purchasedOn, ...impact });
      }
      if (!lowest || scaled(current.regularPricePerGallon,4) < scaled(lowest.regularPricePerGallon,4)) lowest = current;
    }
  }
  return results.sort((a,b)=>{
    const left = scaled(String(a.increasePerGallon),4), right = scaled(String(b.increasePerGallon),4);
    return left === right ? 0 : left > right ? -1 : 1;
  });
}
export function latestImpact(observations: PriceObservation[], assumptions: Assumptions) {
  const all = ordered(observations);
  const latest = all.at(-1);
  if (!latest) return null;
  const prev = all.slice(0,-1).reverse().find(x=>x.fuelGradeId === latest.fuelGradeId);
  if (!prev) return { latestPurchaseId: latest.id, fuelGradeId: latest.fuelGradeId, comparisonAvailable: false };
  return { latestPurchaseId: latest.id, previousPurchaseId: prev.id, fuelGradeId: latest.fuelGradeId,
    comparisonAvailable: true, ...calculateImpact(prev.regularPricePerGallon, latest.regularPricePerGallon, assumptions) };
}
export { ordered as orderHistory };

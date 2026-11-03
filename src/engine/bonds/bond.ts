import { z } from 'zod';
import { ValidationError, validate } from '../core/errors';
import { addMonths, days30360, daysBetween, isValidISO, parseISO, toISO, type DayCount } from '../core/dates';
import { solveRoot } from '../core/solver';
import { calculateXIRR } from '../finance/xirr';

/**
 * CALCULATEUR OBLIGATAIRE (obligation à taux fixe, remboursement in fine au pair)
 *
 * Prix (en % du nominal), convention « street » identique aux fonctions PRICE/YIELD d'Excel :
 *   P_plein = Σ_{k=1..N} (100·c/f) / (1 + y/f)^(k−1+w) + R / (1 + y/f)^(N−1+w)
 *   w = DSC / E (fraction de période jusqu'au prochain coupon)
 *   Prix pied de coupon = P_plein − coupon couru, coupon couru = (100·c/f) × A / E
 * Pour une seule période restante : formule actuarielle simple (comme Excel).
 * Rendement actuariel annuel (ICMA) = (1 + y/f)^f − 1.
 */
export const bondSchema = z.object({
  nominal: z.number().positive('Nominal investi requis'),
  couponRate: z.number().min(0).max(0.5),
  frequency: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(12)]),
  settlementDate: z.string().refine(isValidISO, 'Date de règlement invalide'),
  maturityDate: z.string().refine(isValidISO, 'Date d’échéance invalide'),
  dayCount: z.enum(['ACT/ACT', 'ACT/365', 'ACT/360', '30/360']),
  mode: z.enum(['price-to-yield', 'yield-to-price']),
  cleanPrice: z.number().min(1).max(300).optional(),
  yieldRate: z.number().min(-0.2).max(1).optional(),
  redemption: z.number().min(1).max(300).default(100),
  taxRate: z.number().min(0).max(1).default(0),
});
export type BondInput = z.input<typeof bondSchema>;

interface Schedule { prev: Date; next: Date; couponDates: Date[] }

export function couponSchedule(settlement: Date, maturity: Date, frequency: number): Schedule {
  const step = 12 / frequency;
  const dates: Date[] = [];
  let k = 0;
  let d = maturity;
  while (d > settlement) {
    dates.unshift(d);
    k++;
    d = addMonths(maturity, -step * k);
    if (k > 2000) throw new ValidationError(['Échéancier trop long']);
  }
  return { prev: d, next: dates[0], couponDates: dates };
}

function periodMetrics(s: Date, sch: Schedule, dc: DayCount, f: number) {
  let A: number, E: number, DSC: number;
  switch (dc) {
    case '30/360':
      A = days30360(sch.prev, s); E = 360 / f; DSC = E - A; break;
    case 'ACT/365':
      A = daysBetween(sch.prev, s); E = 365 / f; DSC = daysBetween(s, sch.next); break;
    case 'ACT/360':
      A = daysBetween(sch.prev, s); E = 360 / f; DSC = daysBetween(s, sch.next); break;
    default:
      A = daysBetween(sch.prev, s); E = daysBetween(sch.prev, sch.next); DSC = daysBetween(s, sch.next);
  }
  return { A, E, DSC };
}

export function bondDirtyPrice(y: number, c: number, f: number, N: number, w: number, R: number) {
  const cpn = (100 * c) / f;
  const v = 1 + y / f;
  let pv = 0;
  for (let k = 1; k <= N; k++) pv += cpn / Math.pow(v, k - 1 + w);
  return pv + R / Math.pow(v, N - 1 + w);
}

export function calculateBondYield(raw: BondInput) {
  const i = validate(bondSchema, raw);
  const s = parseISO(i.settlementDate), m = parseISO(i.maturityDate);
  if (m <= s) throw new ValidationError(['L’échéance doit être postérieure à la date de règlement']);
  if (i.mode === 'price-to-yield' && i.cleanPrice === undefined) throw new ValidationError(['Prix d’achat requis']);
  if (i.mode === 'yield-to-price' && i.yieldRate === undefined) throw new ValidationError(['Rendement requis']);
  const f = i.frequency, c = i.couponRate, R = i.redemption;
  const sch = couponSchedule(s, m, f);
  const N = sch.couponDates.length;
  const { A, E, DSC } = periodMetrics(s, sch, i.dayCount as DayCount, f);
  const w = DSC / E;
  const cpn = (100 * c) / f;
  const accrued = (cpn * A) / E;

  const cleanFromYield = (y: number) => {
    if (N === 1) return (R + cpn) / (1 + (w * y) / f) - accrued;
    return bondDirtyPrice(y, c, f, N, w, R) - accrued;
  };

  let clean: number, y: number;
  if (i.mode === 'yield-to-price') {
    y = i.yieldRate!;
    clean = cleanFromYield(y);
  } else {
    clean = i.cleanPrice!;
    if (N === 1) {
      const dirty = clean + accrued;
      y = ((R + cpn) / dirty - 1) * (f / w);
    } else {
      y = solveRoot((yy) => cleanFromYield(yy) - clean, { guess: c || 0.03, lo: -0.99 * f, hi: 5, tol: 1e-11 }).root;
    }
  }
  const dirty = clean + accrued;

  // Duration (Macaulay / modifiée) et convexité, en années
  const v = 1 + y / f;
  let pvSum = 0, tSum = 0, cxSum = 0;
  for (let k = 1; k <= N; k++) {
    const t = k - 1 + w; // en périodes
    const cf = cpn + (k === N ? R : 0);
    const pv = cf / Math.pow(v, t);
    pvSum += pv; tSum += t * pv; cxSum += t * (t + 1) * pv;
  }
  const macaulay = tSum / pvSum / f;
  const modified = macaulay / v;
  const convexity = cxSum / pvSum / (v * v) / (f * f);

  const units = i.nominal / 100;
  const couponAmount = cpn * units;
  const totalCoupons = couponAmount * N;
  const capitalGain = (R - clean) * units;
  const cost = dirty * units;

  // Rendement net indicatif après fiscalité (coupons et plus-value taxés au taux saisi, pas d'imputation de moins-value)
  let netYield = NaN;
  if (i.taxRate >= 0) {
    try {
      const flows = [{ date: toISO(s), amount: -cost }];
      sch.couponDates.forEach((d, k) => {
        let amt = couponAmount * (1 - i.taxRate);
        if (k === N - 1) amt += R * units - Math.max(0, capitalGain) * i.taxRate;
        flows.push({ date: toISO(d), amount: amt });
      });
      netYield = calculateXIRR({ flows }).irr;
    } catch { /* non défini */ }
  }

  return {
    cleanPrice: clean,
    dirtyPrice: dirty,
    accruedInterest: accrued,
    accruedAmount: accrued * units,
    accruedDays: A,
    periodDays: E,
    yieldToMaturity: y,
    annualEffectiveYield: Math.pow(1 + y / f, f) - 1,
    currentYield: (100 * c) / clean,
    macaulayDuration: macaulay,
    modifiedDuration: modified,
    convexity,
    remainingCoupons: N,
    previousCoupon: toISO(sch.prev),
    nextCoupon: toISO(sch.next),
    couponAmount,
    totalCoupons,
    capitalGain,
    cost,
    totalReceived: totalCoupons + R * units,
    netYieldAfterTax: netYield,
    yearsToMaturity: daysBetween(s, m) / 365.25,
    schedule: sch.couponDates.map((d, k) => ({ date: toISO(d), coupon: couponAmount, principal: k === N - 1 ? R * units : 0 })),
  };
}

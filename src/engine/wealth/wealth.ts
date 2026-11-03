import { z } from 'zod';
import { validate } from '../core/errors';
import { annuityFactor, safeDiv } from '../core/math';

/* ================================================================== */
/* Projection patrimoniale                                             */
/* ================================================================== */
/**
 * Patrimoine net_t = Financier_t + Immobilier_t − Dette_t
 *  Financier_{t+1} = Financier_t × (1 + r_f) + Épargne_t  (épargne versée en fin d'année, indexée si demandé)
 *  Immobilier_{t+1} = Immobilier_t × (1 + r_i)
 *  Dette amortie par annuités constantes sur sa durée résiduelle au taux du crédit.
 *  Valeur réelle = nominale / (1 + inflation)^t.
 */
export const projectionSchema = z.object({
  financialAssets: z.number().min(0),
  realEstate: z.number().min(0),
  debt: z.number().min(0),
  debtRate: z.number().min(0).max(0.2),
  debtYears: z.number().int().min(0).max(40),
  annualSavings: z.number().min(0),
  indexSavings: z.boolean().default(true),
  financialReturn: z.number().min(-0.2).max(0.3),
  realEstateGrowth: z.number().min(-0.2).max(0.3),
  inflation: z.number().min(-0.05).max(0.2),
  years: z.number().int().min(1).max(50),
});
export type ProjectionInput = z.input<typeof projectionSchema>;

export function calculatePatrimonialProjection(raw: ProjectionInput) {
  const i = validate(projectionSchema, raw);
  let fin = i.financialAssets, re = i.realEstate, debt = i.debt;
  const annuity = i.debt > 0 && i.debtYears > 0 ? i.debt * annuityFactor(i.debtRate, i.debtYears) : 0;
  const rows = [{ year: 0, financial: fin, realEstate: re, debt, net: fin + re - debt, real: fin + re - debt, savings: 0 }];
  for (let t = 1; t <= i.years; t++) {
    const savings = i.annualSavings * (i.indexSavings ? Math.pow(1 + i.inflation, t - 1) : 1);
    fin = fin * (1 + i.financialReturn) + savings;
    re = re * (1 + i.realEstateGrowth);
    if (debt > 0 && t <= i.debtYears) {
      const interest = debt * i.debtRate;
      debt = Math.max(0, debt - (annuity - interest));
    }
    if (t >= i.debtYears) debt = 0;
    const net = fin + re - debt;
    rows.push({ year: t, financial: fin, realEstate: re, debt, net, real: net / Math.pow(1 + i.inflation, t), savings });
  }
  const at = (y: number) => rows[Math.min(y, i.years)];
  return {
    initialNet: rows[0].net,
    finalNet: rows[i.years].net,
    finalReal: rows[i.years].real,
    milestones: [10, 20, 30].filter((y) => y <= i.years).map((y) => at(y)),
    debtAnnuity: annuity,
    rows,
  };
}

/* ================================================================== */
/* Allocation d'actifs                                                 */
/* ================================================================== */
export const allocationSchema = z.object({
  lines: z.array(z.object({
    label: z.string().min(1),
    amount: z.number().min(0),
    target: z.number().min(0).max(1).optional(),
    expectedReturn: z.number().min(-0.5).max(1).optional(),
  })).min(1),
});
export type AllocationInput = z.input<typeof allocationSchema>;

export function calculateAllocation(raw: AllocationInput) {
  const i = validate(allocationSchema, raw);
  const total = i.lines.reduce((a, l) => a + l.amount, 0);
  const targetSum = i.lines.reduce((a, l) => a + (l.target ?? 0), 0);
  const hasTargets = targetSum > 0;
  const lines = i.lines.map((l) => {
    const weight = safeDiv(l.amount, total);
    const targetAmount = hasTargets ? (l.target ?? 0) * total : undefined;
    return { ...l, weight, targetAmount, rebalance: targetAmount !== undefined ? targetAmount - l.amount : undefined };
  });
  const expected = i.lines.every((l) => l.expectedReturn === undefined)
    ? undefined
    : lines.reduce((a, l) => a + l.weight * (l.expectedReturn ?? 0), 0);
  const warnings: string[] = [];
  if (hasTargets && Math.abs(targetSum - 1) > 1e-6) warnings.push(`La somme des poids cibles fait ${(targetSum * 100).toFixed(1)} % (≠ 100 %).`);
  return { total, lines, expectedReturn: expected, targetSum, hasTargets, warnings };
}

/* ================================================================== */
/* Rente / retraits programmés                                         */
/* ================================================================== */
/**
 * Simulation mensuelle : C_{m+1} = C_m × (1 + r_m) − W_m, retrait en début de mois,
 * r_m = (1 + r)^(1/12) − 1, W indexé annuellement sur l'inflation si demandé.
 * Retrait soutenable sur une durée D : annuité de début de période (indexée : résolution numérique).
 */
export const withdrawalSchema = z.object({
  capital: z.number().positive(),
  annualReturn: z.number().min(-0.2).max(0.3),
  monthlyWithdrawal: z.number().min(0),
  inflation: z.number().min(-0.05).max(0.2),
  indexWithdrawals: z.boolean().default(true),
  horizonYears: z.number().int().min(1).max(60),
});
export type WithdrawalInput = z.input<typeof withdrawalSchema>;

function simulateWithdrawals(capital: number, rm: number, w0: number, inflation: number, index: boolean, maxMonths: number) {
  let c = capital;
  let total = 0;
  const yearly: { year: number; capital: number; withdrawn: number; monthly: number }[] = [];
  let withdrawnYear = 0;
  let depletedAt: number | null = null;
  let w = w0;
  for (let m = 0; m < maxMonths; m++) {
    if (m > 0 && m % 12 === 0) {
      yearly.push({ year: m / 12, capital: c, withdrawn: withdrawnYear, monthly: w });
      withdrawnYear = 0;
      if (index) w = w * (1 + inflation);
    }
    const take = Math.min(w, c);
    c -= take;
    total += take;
    withdrawnYear += take;
    if (c <= 1e-9 && depletedAt === null && w > 0) { depletedAt = m + 1; c = 0; }
    c *= 1 + rm;
  }
  yearly.push({ year: maxMonths / 12, capital: c, withdrawn: withdrawnYear, monthly: w });
  return { finalCapital: c, total, depletedAt, yearly };
}

export function calculateWithdrawalPlan(raw: WithdrawalInput) {
  const i = validate(withdrawalSchema, raw);
  const rm = Math.pow(1 + i.annualReturn, 1 / 12) - 1;
  const horizon = i.horizonYears * 12;
  const sim = simulateWithdrawals(i.capital, rm, i.monthlyWithdrawal, i.inflation, i.indexWithdrawals, horizon);
  const longRun = simulateWithdrawals(i.capital, rm, i.monthlyWithdrawal, i.inflation, i.indexWithdrawals, 100 * 12);
  // Retrait soutenable sur l'horizon (capital épuisé à l'horizon)
  let lo = 0, hi = i.capital;
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2;
    const s = simulateWithdrawals(i.capital, rm, mid, i.inflation, i.indexWithdrawals, horizon);
    if (s.depletedAt === null && s.finalCapital > 0.01) lo = mid; else hi = mid;
  }
  const perpetual = (Math.pow(1 + i.annualReturn, 1) - 1 - (i.indexWithdrawals ? i.inflation : 0));
  return {
    depletionMonths: longRun.depletedAt, // null = jamais (≥ 100 ans)
    depletionYears: longRun.depletedAt !== null ? longRun.depletedAt / 12 : null,
    finalCapital: sim.depletedAt !== null ? 0 : sim.finalCapital,
    totalWithdrawn: sim.total,
    sustainableMonthly: lo,
    perpetualMonthlyApprox: perpetual > 0 ? (i.capital * perpetual) / 12 : 0,
    yearly: sim.yearly,
    depletedWithinHorizon: sim.depletedAt !== null,
  };
}

/* ================================================================== */
/* Revenus complémentaires                                             */
/* ================================================================== */
export const incomeSchema = z.object({
  capital: z.number().positive(),
  totalReturn: z.number().min(-0.2).max(0.3),
  distributionRate: z.number().min(0).max(0.3),
  taxRate: z.number().min(0).max(1),
  years: z.number().int().min(1).max(50),
  inflation: z.number().min(-0.05).max(0.2).default(0),
});
export type IncomeInput = z.input<typeof incomeSchema>;

/**
 * Revenu brut annuel = Capital_t × taux de distribution ; revenu net = brut × (1 − fiscalité).
 * Le capital évolue au rythme (rendement total − distribution) : si la distribution excède
 * le rendement, le capital s'érode.
 */
export function calculateComplementaryIncome(raw: IncomeInput) {
  const i = validate(incomeSchema, raw);
  let c = i.capital;
  const rows: { year: number; capital: number; gross: number; net: number; realNet: number }[] = [];
  let totalNet = 0;
  for (let t = 1; t <= i.years; t++) {
    const gross = c * i.distributionRate;
    const net = gross * (1 - i.taxRate);
    c = c * (1 + i.totalReturn) - gross;
    totalNet += net;
    rows.push({ year: t, capital: Math.max(0, c), gross, net, realNet: net / Math.pow(1 + i.inflation, t) });
    if (c <= 0) { c = 0; }
  }
  const grossAnnual = i.capital * i.distributionRate;
  const netAnnual = grossAnnual * (1 - i.taxRate);
  const warnings: string[] = [];
  if (i.distributionRate > i.totalReturn) warnings.push('Distribution supérieure au rendement total : une partie des revenus correspond à un remboursement de capital, qui s’érode.');
  return { grossAnnual, netAnnual, netMonthly: netAnnual / 12, finalCapital: c, totalNet, netYield: i.distributionRate * (1 - i.taxRate), rows, warnings };
}

/* ================================================================== */
/* Capitalisation vs distribution                                      */
/* ================================================================== */
export const capVsDistSchema = z.object({
  capital: z.number().positive(),
  totalReturn: z.number().min(-0.2).max(0.3),
  distributionRate: z.number().min(0).max(0.3),
  distributionTax: z.number().min(0).max(1),
  exitTax: z.number().min(0).max(1),
  reinvest: z.boolean(),
  years: z.number().int().min(1).max(50),
});
export type CapVsDistInput = z.input<typeof capVsDistSchema>;

/**
 * Part capitalisante : V_n = C(1+r)^n, fiscalité à la sortie sur la plus-value.
 * Part distribuante : la valeur progresse de (r − d), les distributions sont taxées chaque année ;
 * si réinvesties, le net achète de nouvelles parts (nouveau prix de revient).
 * Les plus-values latentes de la part distribuante sont taxées à la sortie au même taux.
 */
export function compareCapitalisationDistribution(raw: CapVsDistInput) {
  const i = validate(capVsDistSchema, raw);
  const rows: { year: number; capitalisation: number; distribution: number }[] = [];
  let capV = i.capital;
  let distV = i.capital;
  let distCost = i.capital;
  let cash = 0;
  let distTaxPaid = 0;
  for (let t = 1; t <= i.years; t++) {
    capV *= 1 + i.totalReturn;
    const gross = distV * i.distributionRate;
    distV = distV * (1 + i.totalReturn) - gross;
    const tax = gross * i.distributionTax;
    distTaxPaid += tax;
    const net = gross - tax;
    if (i.reinvest) { distV += net; distCost += net; } else cash += net;
    const capNet = capV - Math.max(0, capV - i.capital) * i.exitTax;
    const distNet = distV - Math.max(0, distV - distCost) * i.exitTax + cash;
    rows.push({ year: t, capitalisation: capNet, distribution: distNet });
  }
  const last = rows[rows.length - 1];
  const capExitTax = Math.max(0, capV - i.capital) * i.exitTax;
  const distExitTax = Math.max(0, distV - distCost) * i.exitTax;
  return {
    capitalisationNet: last.capitalisation,
    distributionNet: last.distribution,
    difference: last.capitalisation - last.distribution,
    capExitTax,
    distExitTax,
    distTaxPaid,
    cashAccumulated: cash,
    rows,
  };
}

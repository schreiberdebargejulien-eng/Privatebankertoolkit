import { z } from 'zod';
import { validate } from '../core/errors';
import { simulateInvestment } from './investment';

/**
 * Rendement net d'un placement après frais et fiscalité.
 * Valeur brute : C × (1 − frais d'entrée) × [(1 + r)(1 − f)]^n
 * Fiscalité à la sortie sur la plus-value (valeur − capital investi) ou annuelle.
 * Rendement net annualisé = (valeur nette / capital)^(1/n) − 1.
 */
export const netYieldSchema = z.object({
  capital: z.number().positive('Capital investi requis'),
  grossRate: z.number().min(-0.5).max(1),
  annualFee: z.number().min(0).max(0.2),
  entryFee: z.number().min(0).max(0.2),
  taxMode: z.enum(['none', 'exit', 'annual']),
  taxRate: z.number().min(0).max(1),
  years: z.number().int().min(1).max(60),
});
export type NetYieldInput = z.input<typeof netYieldSchema>;

export function calculateNetYield(raw: NetYieldInput) {
  const p = validate(netYieldSchema, raw);
  const base = { initial: p.capital, contribution: 0, contributionFrequency: 1 as const, contributionTiming: 'end' as const, years: p.years };
  const gross = simulateInvestment({ ...base, annualRate: p.grossRate });
  const afterFees = simulateInvestment({ ...base, annualRate: p.grossRate, annualFee: p.annualFee, entryFee: p.entryFee });
  const net = simulateInvestment({ ...base, annualRate: p.grossRate, annualFee: p.annualFee, entryFee: p.entryFee, taxMode: p.taxMode, taxRate: p.taxRate });
  return {
    grossFinal: gross.finalValueNet,
    afterFeesFinal: afterFees.finalValueNet,
    netFinal: net.finalValueNet,
    grossAnnual: p.grossRate,
    afterFeesAnnual: afterFees.netIRR,
    netAnnual: net.netIRR,
    feesCost: gross.finalValueNet - afterFees.finalValueNet,
    taxCost: afterFees.finalValueNet - net.finalValueNet,
    feeDrag: p.grossRate - afterFees.netIRR,
    taxDrag: afterFees.netIRR - net.netIRR,
    schedule: net.schedule,
  };
}

/* ------------------------------------------------------------------ */
/* Comparateur de placements                                           */
/* ------------------------------------------------------------------ */
export const placementSchema = z.object({
  label: z.string().min(1).max(40),
  grossRate: z.number().min(-0.5).max(1),
  annualFee: z.number().min(0).max(0.2),
  entryFee: z.number().min(0).max(0.2),
  taxMode: z.enum(['none', 'exit', 'annual']),
  taxRate: z.number().min(0).max(1),
});
export const compareSchema = z.object({
  initial: z.number().min(0),
  monthlyContribution: z.number().min(0),
  years: z.number().int().min(1).max(60),
  placements: z.array(placementSchema).min(2, 'Au moins deux placements à comparer').max(5),
});
export type CompareInput = z.input<typeof compareSchema>;

export function comparePlacements(raw: CompareInput) {
  const p = validate(compareSchema, raw);
  const results = p.placements.map((pl) => {
    const r = simulateInvestment({
      initial: p.initial,
      contribution: p.monthlyContribution,
      contributionFrequency: 12,
      contributionTiming: 'start',
      years: p.years,
      annualRate: pl.grossRate,
      annualFee: pl.annualFee,
      entryFee: pl.entryFee,
      taxMode: pl.taxMode,
      taxRate: pl.taxRate,
    });
    return { label: pl.label, ...r };
  });
  const best = results.reduce((a, b) => (b.finalValueNet > a.finalValueNet ? b : a));
  const series = Array.from({ length: p.years }, (_, i) => {
    const row: Record<string, number> = { year: i + 1 };
    results.forEach((r) => { row[r.label] = r.schedule[i].value; });
    return row;
  });
  return { results, bestLabel: best.label, series };
}

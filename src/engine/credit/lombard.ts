import { z } from 'zod';
import { validate } from '../core/errors';
import { safeDiv } from '../core/math';

/**
 * CRÉDIT LOMBARD / NANTISSEMENT DE PORTEFEUILLE
 *
 * Valeur de prêt (lending value) = Σ valeur_i × ratio d'avance_i.
 * LTV = encours du crédit / valeur de marché du portefeuille.
 * Taux d'utilisation de la couverture = encours / valeur de prêt (100 % = appel de marge).
 * Seuils (exprimés en % de la valeur de prêt) : alerte (ex. 90 %), appel de marge (100 %),
 * liquidation (ex. 110 %). Ces seuils sont contractuels et propres à chaque établissement.
 *
 * Choc de marché : chaque classe subit choc × sensibilité_i (β simplifié saisi par l'utilisateur).
 * Baisse de marché maximale avant seuil : résolue analytiquement (fonction linéaire du choc).
 */
export const assetLineSchema = z.object({
  label: z.string().min(1),
  value: z.number().min(0),
  advanceRate: z.number().min(0).max(1),
  sensitivity: z.number().min(0).max(2),
});
export const lombardSchema = z.object({
  assets: z.array(assetLineSchema).min(1),
  loanAmount: z.number().min(0),
  annualRate: z.number().min(0).max(0.3),
  years: z.number().positive().max(30),
  alertThreshold: z.number().min(0.5).max(1.5),
  marginCallThreshold: z.number().min(0.5).max(1.5),
  liquidationThreshold: z.number().min(0.5).max(2),
  shocks: z.array(z.number().min(0).max(1)).default([0.1, 0.2, 0.3, 0.4]),
}).refine((v) => v.alertThreshold <= v.marginCallThreshold && v.marginCallThreshold <= v.liquidationThreshold, { message: 'Les seuils doivent être croissants : alerte ≤ appel de marge ≤ liquidation' });
export type LombardInput = z.input<typeof lombardSchema>;

export const DEFAULT_LOMBARD_CLASSES = [
  { label: 'Liquidités', value: 0, advanceRate: 0.95, sensitivity: 0 },
  { label: 'Monétaire', value: 0, advanceRate: 0.9, sensitivity: 0 },
  { label: 'Obligations Investment Grade', value: 0, advanceRate: 0.8, sensitivity: 0.3 },
  { label: 'Obligations High Yield', value: 0, advanceRate: 0.5, sensitivity: 0.6 },
  { label: 'Actions grandes capitalisations', value: 0, advanceRate: 0.6, sensitivity: 1 },
  { label: 'Fonds diversifiés', value: 0, advanceRate: 0.6, sensitivity: 0.6 },
  { label: 'Produits structurés', value: 0, advanceRate: 0.5, sensitivity: 0.8 },
  { label: 'Private equity / non coté', value: 0, advanceRate: 0, sensitivity: 1 },
];

function stateAt(assets: z.infer<typeof assetLineSchema>[], shock: number, loan: number) {
  const marketValue = assets.reduce((a, x) => a + x.value * Math.max(0, 1 - shock * x.sensitivity), 0);
  const lendingValue = assets.reduce((a, x) => a + x.value * Math.max(0, 1 - shock * x.sensitivity) * x.advanceRate, 0);
  return { marketValue, lendingValue, ltv: safeDiv(loan, marketValue, Infinity), usage: safeDiv(loan, lendingValue, Infinity) };
}

export function calculateLombard(raw: LombardInput) {
  const i = validate(lombardSchema, raw);
  const warnings: string[] = [];
  const s0 = stateAt(i.assets, 0, i.loanAmount);
  const maxLoan = s0.lendingValue;
  const status = (usage: number) => (usage >= i.liquidationThreshold ? 'liquidation' : usage >= i.marginCallThreshold ? 'margin-call' : usage >= i.alertThreshold ? 'alert' : 'ok') as 'ok' | 'alert' | 'margin-call' | 'liquidation';

  // Choc maximal avant d'atteindre un seuil : lendingValue(s) = L0 − s × Σ v_i a_i β_i (linéaire tant que 1 − sβ ≥ 0)
  const slope = i.assets.reduce((a, x) => a + x.value * x.advanceRate * x.sensitivity, 0);
  const shockTo = (threshold: number) => {
    if (i.loanAmount <= 0) return Infinity;
    if (slope <= 0) return Infinity;
    const s = (s0.lendingValue - i.loanAmount / threshold) / slope;
    return Math.max(0, s);
  };
  const scenarios = [0, ...i.shocks].map((s) => {
    const st = stateAt(i.assets, s, i.loanAmount);
    return { shock: s, ...st, status: status(st.usage), excess: Math.max(0, i.loanAmount - st.lendingValue) };
  });
  if (i.loanAmount > maxLoan) warnings.push('Le montant demandé excède la valeur de prêt du portefeuille : crédit non couvert dès l’origine.');
  if (i.assets.some((a) => a.sensitivity * 1 > 1 && a.value > 0)) warnings.push('Sensibilité > 1 : la classe baisse plus que le marché.');
  warnings.push('Ratios d’avance, sensibilités et seuils indicatifs : ils dépendent de la politique de crédit de l’établissement, de la concentration et de la liquidité des titres.');

  const interestPerYear = i.loanAmount * i.annualRate;
  return {
    marketValue: s0.marketValue,
    lendingValue: s0.lendingValue,
    maxLoan,
    initialLTV: s0.ltv,
    initialUsage: s0.usage,
    weightedAdvanceRate: safeDiv(s0.lendingValue, s0.marketValue),
    headroom: s0.lendingValue - i.loanAmount,
    interestPerYear,
    totalInterest: interestPerYear * i.years,
    interestPerMonth: interestPerYear / 12,
    maxShockBeforeAlert: shockTo(i.alertThreshold),
    maxShockBeforeMarginCall: shockTo(i.marginCallThreshold),
    maxShockBeforeLiquidation: shockTo(i.liquidationThreshold),
    scenarios,
    lines: i.assets.map((a) => ({ ...a, lendingValue: a.value * a.advanceRate, weight: safeDiv(a.value, s0.marketValue) })),
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Nantissement : capacité de couverture d'un engagement               */
/* ------------------------------------------------------------------ */
export const pledgeSchema = z.object({
  assets: z.array(z.object({ label: z.string(), value: z.number().min(0), haircut: z.number().min(0).max(1) })).min(1),
  exposure: z.number().min(0),
});
export type PledgeInput = z.input<typeof pledgeSchema>;

/** Valeur éligible = Σ valeur × (1 − décote). Ratio de couverture = valeur éligible / engagement. */
export function calculatePledge(raw: PledgeInput) {
  const i = validate(pledgeSchema, raw);
  const total = i.assets.reduce((a, x) => a + x.value, 0);
  const eligible = i.assets.reduce((a, x) => a + x.value * (1 - x.haircut), 0);
  const coverageRatio = safeDiv(eligible, i.exposure, Infinity);
  return {
    total,
    eligible,
    averageHaircut: safeDiv(total - eligible, total),
    coverageRatio,
    surplus: eligible - i.exposure,
    covered: eligible >= i.exposure,
    additionalCollateralNeeded: Math.max(0, i.exposure - eligible),
    lines: i.assets.map((a) => ({ ...a, eligible: a.value * (1 - a.haircut) })),
  };
}

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
 * Choc de marché : chaque classe subit choc × sensibilité_i (β simplifié, déduit du SRI par `sriSensitivity`).
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

/**
 * SRI (indicateur synthétique de risque PRIIPs, échelle 1 à 7) → sensibilité au choc de marché.
 * Convention de l'outil : le choc saisi est celui d'un portefeuille actions (SRI 5 ⇒ β = 1) ;
 * les autres classes en subissent une fraction croissante avec le SRI, d'après les bandes de
 * volatilité PRIIPs (1 : < 0,5 % ; 2 : 0,5–5 % ; 3 : 5–12 % ; 4 : 12–20 % ; 5 : 20–30 % ; 6 : 30–80 % ; 7 : > 80 %).
 */
export const SRI_SENSITIVITY: Record<number, number> = { 1: 0, 2: 0.15, 3: 0.35, 4: 0.7, 5: 1, 6: 1.4, 7: 2 };
export function sriSensitivity(sri: number): number {
  const k = Math.min(7, Math.max(1, Math.round(sri)));
  return SRI_SENSITIVITY[k];
}

export interface LombardAssetClass {
  id: string;
  label: string;
  /** Ratio d'avance indicatif (valeur de prêt / valeur de marché). */
  advanceRate: number;
  /** SRI type de la classe (1 à 7), modifiable ligne par ligne. */
  sri: number;
}

/** Classes d'actifs proposées, avec ratio d'avance et SRI indicatifs (à aligner sur la politique de crédit). */
export const LOMBARD_ASSET_CLASSES: LombardAssetClass[] = [
  { id: 'cash-eur', label: 'Liquidités en euros', advanceRate: 0.95, sri: 1 },
  { id: 'cash-fx', label: 'Liquidités en devises', advanceRate: 0.85, sri: 2 },
  { id: 'money-market', label: 'Fonds monétaires', advanceRate: 0.9, sri: 1 },
  { id: 'euro-fund', label: 'Assurance-vie — fonds euros', advanceRate: 0.9, sri: 1 },
  { id: 'gov-bonds', label: 'Obligations d’État zone euro', advanceRate: 0.85, sri: 2 },
  { id: 'ig-bonds', label: 'Obligations Investment Grade', advanceRate: 0.8, sri: 2 },
  { id: 'ig-funds', label: 'Fonds obligataires Investment Grade', advanceRate: 0.75, sri: 2 },
  { id: 'hy-bonds', label: 'Obligations High Yield', advanceRate: 0.5, sri: 3 },
  { id: 'em-bonds', label: 'Fonds obligataires émergents / High Yield', advanceRate: 0.5, sri: 3 },
  { id: 'convertibles', label: 'Obligations convertibles', advanceRate: 0.6, sri: 3 },
  { id: 'balanced-low', label: 'Fonds diversifiés prudents', advanceRate: 0.7, sri: 3 },
  { id: 'balanced-mid', label: 'Fonds diversifiés équilibrés', advanceRate: 0.6, sri: 4 },
  { id: 'balanced-high', label: 'Fonds diversifiés dynamiques', advanceRate: 0.55, sri: 4 },
  { id: 'equity-funds', label: 'Fonds / ETF actions internationales', advanceRate: 0.6, sri: 4 },
  { id: 'large-caps', label: 'Actions grandes capitalisations (titres vifs)', advanceRate: 0.6, sri: 5 },
  { id: 'small-caps', label: 'Actions petites et moyennes capitalisations', advanceRate: 0.4, sri: 5 },
  { id: 'em-equity', label: 'Actions marchés émergents', advanceRate: 0.4, sri: 5 },
  { id: 'structured-protected', label: 'Produits structurés à capital protégé', advanceRate: 0.7, sri: 2 },
  { id: 'structured', label: 'Produits structurés (Autocall, Phoenix…)', advanceRate: 0.5, sri: 4 },
  { id: 'alternative', label: 'Gestion alternative / hedge funds', advanceRate: 0.4, sri: 4 },
  { id: 'real-estate-funds', label: 'SCPI / OPCI / immobilier coté', advanceRate: 0.4, sri: 3 },
  { id: 'gold', label: 'Or et matières premières', advanceRate: 0.5, sri: 5 },
  { id: 'private-equity', label: 'Private equity / non coté', advanceRate: 0, sri: 6 },
  { id: 'crypto', label: 'Cryptoactifs', advanceRate: 0, sri: 7 },
  { id: 'other', label: 'Autre actif', advanceRate: 0.5, sri: 4 },
];
export const lombardClass = (id: string) => LOMBARD_ASSET_CLASSES.find((c) => c.id === id);

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
  if (i.assets.some((a) => a.sensitivity * 1 > 1 && a.value > 0)) warnings.push('Sensibilité > 1 (SRI 6 ou 7) : la classe baisse plus que le marché actions.');
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

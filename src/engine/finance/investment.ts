import { z } from 'zod';
import { validate } from '../core/errors';
import { nominalToEffective, safeDiv } from '../core/math';
import { solveRoot } from '../core/solver';

/**
 * Moteur commun de capitalisation (utilisé par : intérêts composés, rendement net,
 * comparateur de placements, projection).
 *
 * Conventions documentées :
 * - `annualRate` est un taux ANNUEL EFFECTIF (actuariel). Pour un taux nominal capitalisé
 *   m fois par an, convertir au préalable : (1 + i/m)^m − 1.
 * - Le taux appliqué par période de versement est le taux équivalent : (1+r)^(1/f) − 1.
 * - Les frais de gestion annuels sont prélevés sur l'encours au prorata : (1−fee)^(1/f) par période.
 * - Les frais d'entrée sont déduits de chaque versement.
 * - Fiscalité : 'none' ; 'exit' = taxation unique de la plus-value au terme ;
 *   'annual' = taxation chaque fin d'année des gains de l'année (sans report des pertes).
 */
export const investmentSchema = z.object({
  initial: z.number({ message: 'Capital initial requis' }).min(0, 'Le capital initial doit être positif ou nul'),
  contribution: z.number().min(0, 'Les versements doivent être positifs ou nuls'),
  contributionFrequency: z.union([z.literal(1), z.literal(4), z.literal(12)]),
  contributionTiming: z.enum(['start', 'end']),
  years: z.number().int('La durée doit être un nombre entier d’années').min(1, 'Durée minimale : 1 an').max(80, 'Durée maximale : 80 ans'),
  annualRate: z.number().min(-0.99, 'Taux trop faible').max(1, 'Taux supérieur à 100 % : vérifiez la saisie'),
  annualFee: z.number().min(0, 'Frais négatifs impossibles').max(0.2, 'Frais annuels > 20 % : vérifiez la saisie').default(0),
  entryFee: z.number().min(0).max(0.2, 'Frais d’entrée > 20 % : vérifiez la saisie').default(0),
  taxMode: z.enum(['none', 'exit', 'annual']).default('none'),
  taxRate: z.number().min(0).max(1).default(0),
}).refine((v) => v.initial > 0 || v.contribution > 0, { message: 'Saisissez un capital initial ou des versements' });

export type InvestmentInput = z.input<typeof investmentSchema>;

export interface InvestmentYear {
  year: number;
  contributed: number; // versements bruts cumulés
  value: number; // valeur brute d'impôt de sortie (après impôts annuels si 'annual')
  gains: number; // value - contributed
  feesPaid: number; // frais cumulés (entrée + gestion)
  taxPaid: number; // impôts cumulés payés (mode annual)
}

export interface InvestmentResult {
  finalValueGross: number;
  totalContributed: number;
  grossGains: number;
  exitTax: number;
  totalTax: number;
  finalValueNet: number;
  netGains: number;
  totalFees: number;
  /** Rendement annualisé net (TRI des flux de l'investisseur). */
  netIRR: number;
  /** Multiple : valeur nette finale / versements. */
  multiple: number;
  schedule: InvestmentYear[];
}

/** Valeur future d'une série de flux périodiques à un taux périodique donné. */
function periodicIRR(flows: { t: number; amount: number }[], final: number, totalT: number): number {
  // Trouver r annuel tel que Σ flux × (1+r)^(T − t) = final
  if (final <= 0) return -1;
  const f = (r: number) => flows.reduce((acc, fl) => acc + fl.amount * Math.pow(1 + r, totalT - fl.t), 0) - final;
  return solveRoot(f, { guess: 0.05, lo: -0.99, hi: 10 }).root;
}

export function simulateInvestment(raw: InvestmentInput): InvestmentResult {
  const p = validate(investmentSchema, raw);
  const f = p.contributionFrequency;
  const rp = Math.pow(1 + p.annualRate, 1 / f) - 1;
  const feeFactor = Math.pow(1 - p.annualFee, 1 / f);

  let value = 0;
  let contributed = 0;
  let fees = 0;
  let taxPaid = 0;
  const flows: { t: number; amount: number }[] = [];
  const schedule: InvestmentYear[] = [];

  const invest = (amount: number, t: number) => {
    if (amount <= 0) return;
    const fee = amount * p.entryFee;
    fees += fee;
    value += amount - fee;
    contributed += amount;
    flows.push({ t, amount });
  };

  invest(p.initial, 0);
  let yearStartValue = value;
  let yearContrib = 0;

  for (let y = 1; y <= p.years; y++) {
    yearStartValue = value;
    yearContrib = 0;
    for (let k = 0; k < f; k++) {
      const t = y - 1 + k / f;
      if (p.contributionTiming === 'start') { invest(p.contribution, t); yearContrib += p.contribution; }
      const before = value * (1 + rp);
      const after = before * feeFactor;
      fees += before - after;
      value = after;
      if (p.contributionTiming === 'end') { invest(p.contribution, t + 1 / f); yearContrib += p.contribution; }
    }
    if (p.taxMode === 'annual') {
      const netContribAfterFees = yearContrib * (1 - p.entryFee);
      const gain = value - yearStartValue - netContribAfterFees;
      if (gain > 0) {
        const tax = gain * p.taxRate;
        taxPaid += tax;
        value -= tax;
      }
    }
    schedule.push({ year: y, contributed, value, gains: value - contributed, feesPaid: fees, taxPaid });
  }

  const finalValueGross = value;
  const grossGains = finalValueGross - contributed;
  const exitTax = p.taxMode === 'exit' ? Math.max(0, grossGains) * p.taxRate : 0;
  const finalValueNet = finalValueGross - exitTax;
  const netIRR = periodicIRR(flows, finalValueNet, p.years);

  return {
    finalValueGross,
    totalContributed: contributed,
    grossGains,
    exitTax,
    totalTax: exitTax + taxPaid,
    finalValueNet,
    netGains: finalValueNet - contributed,
    totalFees: fees,
    netIRR,
    multiple: safeDiv(finalValueNet, contributed),
    schedule,
  };
}

/* ------------------------------------------------------------------ */
/* Intérêts composés                                                   */
/* ------------------------------------------------------------------ */

export const compoundSchema = z.object({
  initial: z.number().min(0),
  contribution: z.number().min(0),
  contributionFrequency: z.union([z.literal(1), z.literal(4), z.literal(12)]),
  contributionTiming: z.enum(['start', 'end']),
  years: z.number().int().min(1).max(80),
  /** Taux annuel NOMINAL. */
  nominalRate: z.number().min(-0.5).max(1),
  /** Fréquence de capitalisation des intérêts (1, 2, 4, 12, 365). */
  compounding: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(12), z.literal(365)]),
  taxMode: z.enum(['none', 'exit', 'annual']),
  taxRate: z.number().min(0).max(1),
});
export type CompoundInput = z.input<typeof compoundSchema>;

/**
 * Intérêts composés.
 * Formule : taux effectif annuel = (1 + i/m)^m − 1, puis capitalisation des versements
 * au taux équivalent par période de versement. Sans versements ni fiscalité :
 * C_n = C_0 × (1 + i/m)^(m×n).
 */
export function calculateCompoundInterest(raw: CompoundInput) {
  const p = validate(compoundSchema, raw);
  const effectiveRate = nominalToEffective(p.nominalRate, p.compounding);
  const r = simulateInvestment({
    initial: p.initial,
    contribution: p.contribution,
    contributionFrequency: p.contributionFrequency,
    contributionTiming: p.contributionTiming,
    years: p.years,
    annualRate: effectiveRate,
    taxMode: p.taxMode,
    taxRate: p.taxRate,
  });
  return { ...r, effectiveRate, interest: r.grossGains, performance: safeDiv(r.netGains, r.totalContributed) };
}

import { z } from 'zod';
import { ValidationError, validate } from '../core/errors';
import { solveRoot } from '../core/solver';
import { resolveInvestmentTax, TAX_REGIMES, type InvestmentTaxResult } from '../tax/fr/investmentTax';

/**
 * COMPTE À TERME (CAT)
 * ---------------------------------------------------------------
 * - Intérêts simples calculés par année contractuelle : capital × taux_année × mois / 12
 *   (mode « capitalisés » : intérêts ajoutés au capital à chaque anniversaire).
 * - Taux fixe ou progressif : taux_k = taux initial + k × pas annuel.
 * - Versement des intérêts : à l'échéance, annuel (à chaque anniversaire) ou capitalisés.
 * - Sortie anticipée : intérêts recalculés depuis l'origine au taux de pénalité
 *   (intérêts simples) ; le trop-perçu éventuel est déduit du capital restitué.
 * - Fiscalité :
 *   · particulier (PFU, barème, taux libre) : imposition à l'encaissement ou à l'inscription
 *     en compte des intérêts (capitalisation annuelle) ;
 *   · société à l'IS : imposition des intérêts courus à chaque exercice (art. 38 CGI),
 *     exercice supposé aligné sur les anniversaires du dépôt.
 * - TRI : flux mensuels datés en fraction d'années (mois / 12).
 */
export const termDepositSchema = z.object({
  capital: z.number().positive('Montant déposé requis'),
  months: z.number().int('Durée en mois entiers').min(1, 'Durée minimale : 1 mois').max(240, 'Durée maximale : 20 ans'),
  rateMode: z.enum(['fixed', 'progressive']).default('fixed'),
  annualRate: z.number().min(0, 'Taux négatif non géré').max(0.2, 'Taux > 20 % : vérifiez la saisie'),
  stepUp: z.number().min(-0.05).max(0.05).default(0),
  paymentMode: z.enum(['maturity', 'annual', 'capitalized']).default('maturity'),
  earlyExit: z.boolean().default(false),
  exitMonth: z.number().int().min(1).default(12),
  earlyRate: z.number().min(0).max(0.2).default(0),
  inflation: z.number().min(-0.05).max(0.2).default(0),
  taxRegime: z.enum(TAX_REGIMES).default('pfu'),
  tmi: z.number().min(0).max(0.45).default(0.3),
  isRate: z.enum(['normal', 'reduced']).default('normal'),
  customRate: z.number().min(0).max(1).default(0),
  date: z.string().optional(),
});
export type TermDepositInput = z.input<typeof termDepositSchema>;

export interface TermDepositRow {
  year: number;
  months: number;
  endMonth: number;
  rate: number;
  accrued: number;
  paid: number;
  tax: number;
  balance: number;
}

function irr(flows: { t: number; a: number }[]) {
  try {
    return solveRoot((x) => flows.reduce((acc, f) => acc + f.a / Math.pow(1 + x, f.t), 0), { guess: 0.03, lo: -0.99, hi: 5 }).root;
  } catch { return NaN; }
}

export function calculateTermDeposit(raw: TermDepositInput) {
  const p = validate(termDepositSchema, raw);
  const warnings: string[] = [];
  if (p.earlyExit && p.exitMonth >= p.months) warnings.push('Mois de sortie ≥ durée du dépôt : la sortie anticipée est ignorée.');
  const early = p.earlyExit && p.exitMonth < p.months;
  const end = early ? p.exitMonth : p.months;
  if (p.taxRegime === 'pea') throw new ValidationError(['Les comptes à terme ne sont pas éligibles au PEA']);
  const tax: InvestmentTaxResult = resolveInvestmentTax({ regime: p.taxRegime, tmi: p.tmi, isRate: p.isRate, customRate: p.customRate, holdingYears: end / 12, date: p.date });
  const corporate = p.taxRegime === 'is';

  // 1) Intérêts contractuels par année
  const rows: TermDepositRow[] = [];
  let balance = p.capital;
  for (let y = 1, start = 0; start < end; y++, start += 12) {
    const m = Math.min(12, end - start);
    const rate = Math.max(0, p.rateMode === 'progressive' ? p.annualRate + p.stepUp * (y - 1) : p.annualRate);
    const accrued = (p.paymentMode === 'capitalized' ? balance : p.capital) * rate * (m / 12);
    if (p.paymentMode === 'capitalized') balance += accrued;
    rows.push({ year: y, months: m, endMonth: start + m, rate, accrued, paid: 0, tax: 0, balance: 0 });
  }
  const contractual = rows.reduce((a, r) => a + r.accrued, 0);
  // 2) Sortie anticipée : intérêts recalculés au taux de pénalité, régularisation sur la dernière période
  let penalty = 0;
  if (early) {
    const target = p.capital * p.earlyRate * (end / 12);
    penalty = contractual - target;
    rows[rows.length - 1].accrued -= penalty;
  }
  // 3) Paiements et impôt
  const flows: { t: number; a: number }[] = [{ t: 0, a: -p.capital }];
  const netFlows: { t: number; a: number }[] = [{ t: 0, a: -p.capital }];
  let cum = 0;
  rows.forEach((r, k) => {
    const last = k === rows.length - 1;
    const t = r.endMonth / 12;
    cum += r.accrued;
    r.paid = p.paymentMode === 'annual' ? r.accrued : last ? cum : 0;
    // Base imposable de l'année
    const taxable = corporate || p.paymentMode === 'capitalized' ? r.accrued : r.paid;
    r.tax = taxable * tax.rate;
    r.balance = p.paymentMode === 'annual' ? p.capital : p.capital + cum;
    const cash = r.paid + (last ? p.capital : 0);
    if (cash) flows.push({ t, a: cash });
    netFlows.push({ t, a: cash - r.tax });
  });

  const grossInterest = rows.reduce((a, r) => a + r.accrued, 0);
  const totalTax = rows.reduce((a, r) => a + r.tax, 0);
  const netInterest = grossInterest - totalTax;
  const years = end / 12;
  const grossIRR = irr(flows);
  const netIRR = irr(netFlows);
  if (p.capital > 100_000 && !corporate) warnings.push('Garantie des dépôts (FGDR) limitée à 100 000 € par déposant et par établissement : la fraction excédentaire porte le risque de l’établissement.');
  if (p.capital > 100_000 && corporate) warnings.push('Garantie FGDR limitée à 100 000 € par déposant et par établissement (personnes morales comprises).');
  if (early && penalty > 0) warnings.push(`Sortie anticipée : ${Math.round(penalty).toLocaleString('fr-FR')} € d’intérêts perdus par rapport aux conditions contractuelles.`);
  if (p.rateMode === 'progressive' && p.paymentMode !== 'annual') warnings.push('CAT progressif : vérifiez dans les conditions si les intérêts sont recalculés au taux de la période atteinte en cas de sortie anticipée.');

  return {
    endMonth: end,
    years,
    early,
    tax,
    contractualInterest: contractual,
    penalty,
    grossInterest,
    totalTax,
    netInterest,
    finalGross: p.capital + grossInterest,
    finalNet: p.capital + netInterest,
    averageRate: years > 0 ? grossInterest / p.capital / years : 0,
    grossIRR,
    netIRR,
    realNetIRR: (1 + netIRR) / (1 + p.inflation) - 1,
    rows,
    flows,
    netFlows,
    warnings,
  };
}

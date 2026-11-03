import { z } from 'zod';
import { validate } from '../core/errors';
import { annuityFactor, round } from '../core/math';
import { solveRoot } from '../core/solver';

/**
 * Conventions crédit (pratique bancaire française) :
 * - taux nominal annuel proportionnel : taux mensuel = taux annuel / 12 ;
 * - mensualité constante : M = C × i / (1 − (1 + i)^−n) ;
 * - assurance emprunteur : % annuel du capital INITIAL (mode courant) ou du capital restant dû ;
 * - TAEG approché : taux actuariel annuel égalisant capital net reçu et flux (mensualités + assurance + frais),
 *   (1 + t_m)^12 − 1 (méthode actuarielle, art. R314-3 C. conso.).
 */
export const amortizationSchema = z.object({
  principal: z.number().positive('Montant emprunté requis'),
  annualRate: z.number().min(0, 'Taux négatif non géré').max(0.3, 'Taux > 30 % : vérifiez la saisie'),
  years: z.number().positive().max(40, 'Durée maximale : 40 ans'),
  insuranceRate: z.number().min(0).max(0.03).default(0),
  insuranceBasis: z.enum(['initial', 'outstanding']).default('initial'),
  fees: z.number().min(0).default(0),
});
export type AmortizationInput = z.input<typeof amortizationSchema>;

export interface AmortizationRow {
  period: number;
  payment: number;
  interest: number;
  principal: number;
  insurance: number;
  balance: number;
}

export function calculateAmortization(raw: AmortizationInput) {
  const i = validate(amortizationSchema, raw);
  const n = Math.round(i.years * 12);
  const r = i.annualRate / 12;
  const payment = i.principal * annuityFactor(r, n);
  const rows: AmortizationRow[] = [];
  let balance = i.principal;
  let totalInterest = 0, totalInsurance = 0;
  for (let k = 1; k <= n; k++) {
    const interest = balance * r;
    let princ = payment - interest;
    if (k === n) princ = balance; // solde exact
    const insurance = (i.insuranceBasis === 'initial' ? i.principal : balance) * (i.insuranceRate / 12);
    balance = Math.max(0, balance - princ);
    totalInterest += interest;
    totalInsurance += insurance;
    rows.push({ period: k, payment: interest + princ, interest, principal: princ, insurance, balance });
  }
  const yearly = Array.from({ length: Math.ceil(n / 12) }, (_, y) => {
    const slice = rows.slice(y * 12, y * 12 + 12);
    return {
      year: y + 1,
      interest: slice.reduce((a, x) => a + x.interest, 0),
      principal: slice.reduce((a, x) => a + x.principal, 0),
      insurance: slice.reduce((a, x) => a + x.insurance, 0),
      balance: slice[slice.length - 1].balance,
    };
  });
  // TAEG approché
  const cashflows = rows.map((x) => x.payment + x.insurance);
  const netReceived = i.principal - i.fees;
  let taeg = NaN;
  try {
    const sol = solveRoot((t) => cashflows.reduce((a, c, k) => a + c / Math.pow(1 + t, k + 1), 0) - netReceived, { guess: r || 0.003, lo: -0.5, hi: 0.2 });
    taeg = Math.pow(1 + sol.root, 12) - 1;
  } catch { /* non défini */ }
  const monthlyInsuranceFirst = rows[0].insurance;
  return {
    months: n,
    payment,
    monthlyInsurance: monthlyInsuranceFirst,
    paymentWithInsurance: payment + monthlyInsuranceFirst,
    totalInterest,
    totalInsurance,
    totalCost: totalInterest + totalInsurance + i.fees,
    totalPaid: i.principal + totalInterest + totalInsurance + i.fees,
    taeg,
    rows,
    yearly,
  };
}

/* ------------------------------------------------------------------ */
/* Capacité d'emprunt                                                  */
/* ------------------------------------------------------------------ */
export const capacitySchema = z.object({
  monthlyIncome: z.number().positive('Revenus mensuels requis'),
  existingCharges: z.number().min(0),
  targetDebtRatio: z.number().min(0.05).max(0.6),
  annualRate: z.number().min(0).max(0.3),
  years: z.number().positive().max(40),
  insuranceRate: z.number().min(0).max(0.03).default(0),
});
export type CapacityInput = z.input<typeof capacitySchema>;

/**
 * Capacité = mensualité disponible × (1 − (1+i)^−n) / i, avec assurance sur capital initial :
 * M_dispo = Revenus × taux d'endettement − charges ; C = M_dispo / (facteur + ta/12).
 * Rappel HCSF : taux d'effort maximal 35 % assurance comprise, durée 25 ans (27 ans en VEFA/travaux).
 */
export function calculateLoanCapacity(raw: CapacityInput) {
  const i = validate(capacitySchema, raw);
  const n = Math.round(i.years * 12);
  const r = i.annualRate / 12;
  const maxPayment = i.monthlyIncome * i.targetDebtRatio - i.existingCharges;
  const warnings: string[] = [];
  if (maxPayment <= 0) {
    return { maxPayment: 0, capacity: 0, payment: 0, insurance: 0, totalCost: 0, currentRatio: i.existingCharges / i.monthlyIncome, warnings: ['Charges existantes supérieures ou égales à la capacité de remboursement : aucune capacité d’emprunt.'] };
  }
  const perUnit = annuityFactor(r, n) + i.insuranceRate / 12;
  const capacity = maxPayment / perUnit;
  if (i.targetDebtRatio > 0.35) warnings.push('Taux d’effort supérieur à 35 % : au-delà de la norme HCSF (dérogations limitées).');
  if (i.years > 25) warnings.push('Durée supérieure à 25 ans : hors norme HCSF (sauf exceptions : VEFA, travaux).');
  const payment = capacity * annuityFactor(r, n);
  const insurance = (capacity * i.insuranceRate) / 12;
  return {
    maxPayment,
    capacity,
    payment,
    insurance,
    totalCost: payment * n - capacity + insurance * n,
    currentRatio: i.existingCharges / i.monthlyIncome,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Crédit in fine                                                      */
/* ------------------------------------------------------------------ */
export const inFineSchema = z.object({
  principal: z.number().positive(),
  annualRate: z.number().min(0).max(0.3),
  years: z.number().positive().max(30),
  frequency: z.union([z.literal(12), z.literal(4), z.literal(1)]),
  insuranceRate: z.number().min(0).max(0.03).default(0),
  /** Placement adossé (nanti) : capital et rendement annuel net, optionnels. */
  collateralCapital: z.number().min(0).default(0),
  collateralRate: z.number().min(-0.2).max(0.3).default(0),
});
export type InFineInput = z.input<typeof inFineSchema>;

/** Intérêts périodiques = C × taux / f ; capital remboursé en totalité à l'échéance. */
export function calculateInFine(raw: InFineInput) {
  const i = validate(inFineSchema, raw);
  const periods = Math.round(i.years * i.frequency);
  const periodicInterest = (i.principal * i.annualRate) / i.frequency;
  const periodicInsurance = (i.principal * i.insuranceRate) / i.frequency;
  const totalInterest = periodicInterest * periods;
  const totalInsurance = periodicInsurance * periods;
  const collateralFinal = i.collateralCapital * Math.pow(1 + i.collateralRate, i.years);
  const rows = Array.from({ length: periods }, (_, k) => ({
    period: k + 1,
    interest: periodicInterest,
    insurance: periodicInsurance,
    principal: k === periods - 1 ? i.principal : 0,
    balance: k === periods - 1 ? 0 : i.principal,
  }));
  return {
    periods,
    periodicInterest,
    periodicInsurance,
    periodicPayment: periodicInterest + periodicInsurance,
    totalInterest,
    totalInsurance,
    totalCost: totalInterest + totalInsurance,
    outstanding: i.principal,
    collateralFinal,
    collateralSurplus: collateralFinal - i.principal,
    breakEvenRate: i.collateralCapital > 0 ? Math.pow(i.principal / i.collateralCapital, 1 / i.years) - 1 : NaN,
    rows,
  };
}

export { round };

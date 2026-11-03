import { z } from 'zod';
import { validate } from '../../core/errors';
import { simulateInvestment } from '../../finance/investment';
import { calculateIR } from './ir';
import { CAPITAL_TAX_VERSIONS, PER_VERSIONS, pickVersion } from './rules';

/**
 * PER — Plan d'épargne retraite (versements volontaires déductibles, art. 163 quatervicies CGI)
 *
 * Plafond individuel = max(10 % × min(revenus pro N-1 ; 8 PASS N-1) ; 10 % PASS N-1),
 *   majoré des plafonds non utilisés des 3 années précédentes (figurant sur l'avis d'impôt).
 * Économie d'impôt = IR(revenu) − IR(revenu − versement déductible) — calcul exact via le barème.
 * Sortie en capital : versements déduits → barème IR (sans abattement 10 %) ; plus-values → PFU.
 * Sortie en rente : rente imposée comme pension (abattement 10 %) + PS sur fraction RVTO selon l'âge.
 */
export const perSchema = z.object({
  netTaxableIncome: z.number().min(0),
  status: z.enum(['single', 'couple', 'widowed']),
  children: z.number().int().min(0).max(20),
  contribution: z.number().positive('Versement requis'),
  capMode: z.enum(['notice', 'estimate']),
  /** Plafond disponible indiqué sur l'avis d'imposition. */
  availableCap: z.number().min(0).default(0),
  /** Revenus d'activité professionnelle nets N-1 du titulaire (pour estimation du plafond). */
  professionalIncome: z.number().min(0).default(0),
  annualContribution: z.number().min(0).default(0),
  years: z.number().int().min(1).max(50),
  annualRate: z.number().min(-0.2).max(0.3),
  annualFee: z.number().min(0).max(0.05).default(0),
  retirementMarginalRate: z.number().min(0).max(0.45),
  ageAtAnnuity: z.number().int().min(50).max(90),
  annuityConversionRate: z.number().min(0.01).max(0.15),
  wrapper: z.enum(['insurance', 'banking']).default('insurance'),
  perVersionId: z.string().optional(),
  irVersionId: z.string().optional(),
});
export type PERInput = z.input<typeof perSchema>;

export function computePERCap(professionalIncome: number, versionId?: string) {
  const p = pickVersion(PER_VERSIONS, undefined, versionId).params;
  const ceiling = p.maxMultiple * p.passPreviousYear;
  return Math.max(p.rate * Math.min(professionalIncome, ceiling), p.rate * p.passPreviousYear);
}

export function calculatePER(raw: PERInput) {
  const i = validate(perSchema, raw);
  const perV = pickVersion(PER_VERSIONS, undefined, i.perVersionId);
  const capV = pickVersion(CAPITAL_TAX_VERSIONS);
  const warnings: string[] = [];

  const cap = i.capMode === 'notice' ? i.availableCap : computePERCap(i.professionalIncome, i.perVersionId);
  const deductible = Math.min(i.contribution, cap);
  const nonDeductible = i.contribution - deductible;
  if (nonDeductible > 0) warnings.push(`Versement supérieur au plafond : ${Math.round(nonDeductible).toLocaleString('fr-FR')} € non déductibles (imposition différente à la sortie).`);
  if (i.capMode === 'estimate') warnings.push('Plafond estimé hors reliquats des 3 années précédentes et hors mutualisation entre conjoints : se référer à l’avis d’imposition.');

  const irBase = { status: i.status, children: i.children, versionId: i.irVersionId } as const;
  const irBefore = calculateIR({ ...irBase, netTaxableIncome: i.netTaxableIncome });
  const irAfter = calculateIR({ ...irBase, netTaxableIncome: Math.max(0, i.netTaxableIncome - deductible) });
  const taxSaving = irBefore.netIncomeTax - irAfter.netIncomeTax;
  const effectiveCost = i.contribution - taxSaving;

  // Projection
  const proj = simulateInvestment({
    initial: i.contribution,
    contribution: i.annualContribution,
    contributionFrequency: 1,
    contributionTiming: 'start',
    years: i.years,
    annualRate: i.annualRate,
    annualFee: i.annualFee,
  });
  const capital = proj.finalValueGross;
  const contributions = proj.totalContributed;
  const gains = Math.max(0, capital - contributions);
  const socialRateGains = i.wrapper === 'insurance' ? capV.params.socialLifeInsurance : capV.params.socialGeneral;

  // Sortie capital (hypothèse : l'ensemble des versements a été déduit)
  const capitalIR = contributions * i.retirementMarginalRate + gains * capV.params.pfuIncomeTax;
  const capitalPS = gains * socialRateGains;
  const capitalNet = capital - capitalIR - capitalPS;

  // Sortie rente
  const perP = perV.params;
  const annuityGross = capital * i.annuityConversionRate;
  const annuityIR = annuityGross * (1 - perP.pensionAllowance) * i.retirementMarginalRate;
  const rvtoFraction = perP.rvtoFractions.find((f) => i.ageAtAnnuity < f.maxAgeExclusive)!.fraction;
  const annuityPS = annuityGross * rvtoFraction * capV.params.socialLifeInsurance;
  const annuityNet = annuityGross - annuityIR - annuityPS;

  warnings.push('Sortie : hypothèse d’une imposition au taux marginal saisi pour la retraite. Abattement de 10 % des pensions plafonné par foyer (non modélisé).');
  warnings.push('Taux de conversion en rente : dépend des tables de mortalité et des conditions de l’assureur — à confirmer contractuellement.');
  if (i.annualContribution > 0) warnings.push('Les versements futurs sont supposés intégralement déductibles chaque année.');

  return {
    cap,
    deductible,
    nonDeductible,
    irBefore: irBefore.netIncomeTax,
    irAfter: irAfter.netIncomeTax,
    marginalRate: irBefore.marginalRate,
    taxSaving,
    savingRate: taxSaving / i.contribution,
    effectiveCost,
    capital,
    contributions,
    gains,
    schedule: proj.schedule,
    capitalExit: { incomeTax: capitalIR, social: capitalPS, net: capitalNet },
    annuityExit: { gross: annuityGross, incomeTax: annuityIR, social: annuityPS, net: annuityNet, monthlyNet: annuityNet / 12, rvtoFraction },
    socialRateGains,
    versionIds: [perV.meta.id, irBefore.versionId, capV.meta.id],
    warnings,
  };
}

import { z } from 'zod';
import { validate } from '../../core/errors';
import { applyBrackets, roundEuro } from '../../core/math';
import { IFI_VERSIONS, pickVersion } from './rules';

/**
 * IFI — Impôt sur la fortune immobilière (art. 964 s. CGI)
 * Base = actifs immobiliers (hors RP) + RP × (1 − 30 %) − dettes déductibles (avec limitation art. 974).
 * Imposable si base nette ≥ 1,3 M€. Décote entre 1,3 et 1,4 M€ : 17 500 − 1,25 % × P.
 * Plafonnement (art. 979) : IR + PS + IFI ≤ 75 % des revenus de l'année précédente.
 */
export const ifiSchema = z.object({
  realEstateAssets: z.number().min(0, 'Valeur positive requise'),
  mainResidenceValue: z.number().min(0),
  deductibleDebts: z.number().min(0),
  applyCap: z.boolean().default(false),
  previousYearIncome: z.number().min(0).default(0),
  previousYearIncomeTaxes: z.number().min(0).default(0),
  versionId: z.string().optional(),
});
export type IFIInput = z.input<typeof ifiSchema>;

export function calculateIFI(raw: IFIInput) {
  const i = validate(ifiSchema, raw);
  const v = pickVersion(IFI_VERSIONS, undefined, i.versionId);
  const p = v.params;
  const warnings: string[] = [];

  const rpAllowance = i.mainResidenceValue * p.mainResidenceAllowance;
  const grossAssets = i.realEstateAssets + i.mainResidenceValue - rpAllowance;

  // Limitation des dettes (art. 974 II CGI)
  let deductibleDebts = i.deductibleDebts;
  let debtLimited = false;
  const lim = p.debtLimitation;
  if (grossAssets > lim.assetThreshold && i.deductibleDebts > lim.ratio * grossAssets) {
    const threshold = lim.ratio * grossAssets;
    deductibleDebts = threshold + (i.deductibleDebts - threshold) * lim.excessDeductibleShare;
    debtLimited = true;
    warnings.push('Dettes supérieures à 60 % de l’actif (patrimoine > 5 M€) : l’excédent n’est déductible qu’à 50 % (art. 974 II CGI).');
  }
  const netAssets = Math.max(0, grossAssets - deductibleDebts);
  const taxable = netAssets >= p.threshold;
  const scale = applyBrackets(netAssets, p.brackets);
  let grossTax = taxable ? scale.tax : 0;
  let decote = 0;
  if (taxable && netAssets <= p.decote.ceiling) decote = Math.max(0, p.decote.fixed - p.decote.rate * netAssets);
  grossTax = Math.max(0, grossTax - decote);

  let capReduction = 0;
  if (i.applyCap && taxable) {
    const limit = p.capRatio * i.previousYearIncome;
    const excess = i.previousYearIncomeTaxes + grossTax - limit;
    if (excess > 0) capReduction = Math.min(grossTax, excess);
  }
  const ifi = roundEuro(grossTax - capReduction);
  if (!taxable) warnings.push(`Patrimoine net taxable inférieur au seuil de ${p.threshold.toLocaleString('fr-FR')} € : pas d’IFI.`);
  warnings.push('Les dettes doivent être afférentes aux actifs taxables et exister au 1er janvier (art. 974 CGI). Les prêts in fine font l’objet d’un abattement annuel spécifique non modélisé.');

  return {
    grossAssets,
    rpAllowance,
    deductibleDebts,
    debtLimited,
    netAssets,
    taxable,
    scaleTax: taxable ? scale.tax : 0,
    decote,
    capReduction,
    ifi,
    marginalRate: taxable ? scale.marginalRate : 0,
    effectiveRate: netAssets > 0 ? ifi / netAssets : 0,
    bracketLines: scale.lines,
    versionId: v.meta.id,
    warnings,
  };
}

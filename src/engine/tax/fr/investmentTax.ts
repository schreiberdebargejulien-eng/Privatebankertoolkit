import { z } from 'zod';
import { validate } from '../../core/errors';
import { CAPITAL_TAX_VERSIONS, CORPORATE_TAX_VERSIONS, pickVersion } from './rules';

/**
 * FISCALITÉ DES PLACEMENTS — résolution d'un taux global selon le régime de l'investisseur
 * ---------------------------------------------------------------------------------------
 * - 'pfu'    : particulier, prélèvement forfaitaire unique (IR 12,8 % + PS au taux général).
 * - 'bareme' : particulier, option globale pour le barème : TMI + PS − TMI × CSG déductible.
 *              (sans abattement de 40 % sur dividendes ni abattement pour durée de détention).
 * - 'pea'    : particulier, plan d'épargne en actions (art. 157, 5° bis CGI) : gains taxés au retrait ;
 *              exonération d'IR après 5 ans (PS seuls), PFU avant 5 ans.
 * - 'is'     : société à l'IS, taux normal ou taux réduit PME (art. 219 CGI) ; pas de PS.
 *              Les produits courus / écarts de valeur liquidative sont en principe taxés chaque exercice.
 * - 'custom' : taux global saisi par l'utilisateur.
 */
export const TAX_REGIMES = ['none', 'pfu', 'bareme', 'pea', 'is', 'custom'] as const;
export type TaxRegime = (typeof TAX_REGIMES)[number];

export const investmentTaxSchema = z.object({
  regime: z.enum(TAX_REGIMES),
  /** Tranche marginale d'imposition (option barème). */
  tmi: z.number().min(0).max(0.45).default(0.3),
  /** Taux d'IS : 'normal' (25 %) ou 'reduced' (15 %). */
  isRate: z.enum(['normal', 'reduced']).default('normal'),
  /** Ancienneté du PEA au moment de l'investissement (années). */
  peaAgeYears: z.number().min(0).max(80).default(0),
  /** Taux libre (régime 'custom'). */
  customRate: z.number().min(0).max(1).default(0),
  /** Durée de détention du placement (années), utilisée pour le PEA. */
  holdingYears: z.number().min(0).default(0),
  /** Date de référence pour le choix des barèmes (ISO). */
  date: z.string().optional(),
});
export type InvestmentTaxInput = z.input<typeof investmentTaxSchema>;

export interface InvestmentTaxResult {
  regime: TaxRegime;
  /** Taux global appliqué aux gains. */
  rate: number;
  incomeTaxRate: number;
  socialRate: number;
  /** true si l'imposition n'intervient qu'à la sortie de l'enveloppe (PEA). */
  exitOnly: boolean;
  label: string;
  detail: string;
  ruleIds: string[];
}

export const TAX_REGIME_LABELS: Record<TaxRegime, string> = {
  none: 'Aucune fiscalité',
  pfu: 'Particulier — PFU (flat tax)',
  bareme: 'Particulier — barème de l’IR',
  pea: 'Particulier — PEA',
  is: 'Société — impôt sur les sociétés',
  custom: 'Taux personnalisé',
};

const fmt = (x: number) => `${(Math.round(x * 1000) / 10).toString().replace('.', ',')} %`;

export function resolveInvestmentTax(raw: InvestmentTaxInput): InvestmentTaxResult {
  const p = validate(investmentTaxSchema, raw);
  const cap = pickVersion(CAPITAL_TAX_VERSIONS, p.date);
  const ps = cap.params.socialGeneral;
  const ir = cap.params.pfuIncomeTax;
  const base = { regime: p.regime, exitOnly: false, label: TAX_REGIME_LABELS[p.regime] };
  switch (p.regime) {
    case 'none':
      return { ...base, rate: 0, incomeTaxRate: 0, socialRate: 0, detail: 'Gains non imposés.', ruleIds: [] };
    case 'custom':
      return { ...base, rate: p.customRate, incomeTaxRate: p.customRate, socialRate: 0, detail: `Taux global saisi : ${fmt(p.customRate)}.`, ruleIds: [] };
    case 'pfu':
      return { ...base, rate: ir + ps, incomeTaxRate: ir, socialRate: ps, detail: `PFU : IR ${fmt(ir)} + prélèvements sociaux ${fmt(ps)} = ${fmt(ir + ps)}.`, ruleIds: [cap.meta.id] };
    case 'bareme': {
      const ded = p.tmi * cap.params.csgDeductible;
      return { ...base, rate: p.tmi + ps - ded, incomeTaxRate: p.tmi - ded, socialRate: ps, detail: `Barème : TMI ${fmt(p.tmi)} + PS ${fmt(ps)} − économie de CSG déductible ${fmt(ded)} = ${fmt(p.tmi + ps - ded)} (sans abattement spécifique).`, ruleIds: [cap.meta.id] };
    }
    case 'pea': {
      const age = p.peaAgeYears + p.holdingYears;
      const exempt = age >= 5 - 1e-9;
      return {
        ...base,
        exitOnly: true,
        rate: exempt ? ps : ir + ps,
        incomeTaxRate: exempt ? 0 : ir,
        socialRate: ps,
        detail: exempt
          ? `PEA de plus de 5 ans au retrait (${Math.round(age * 10) / 10} ans) : exonération d’IR, prélèvements sociaux ${fmt(ps)} sur le gain.`
          : `PEA de moins de 5 ans au retrait (${Math.round(age * 10) / 10} ans) : PFU ${fmt(ir + ps)} sur le gain (et clôture du plan).`,
        ruleIds: [cap.meta.id],
      };
    }
    case 'is': {
      const is = pickVersion(CORPORATE_TAX_VERSIONS, p.date);
      const rate = p.isRate === 'reduced' ? is.params.reducedRate : is.params.normalRate;
      return {
        ...base,
        rate,
        incomeTaxRate: rate,
        socialRate: 0,
        detail: p.isRate === 'reduced'
          ? `IS au taux réduit de ${fmt(rate)} (PME, bénéfice ≤ ${is.params.reducedCeiling.toLocaleString('fr-FR')} €).`
          : `IS au taux normal de ${fmt(rate)} ; pas de prélèvements sociaux.`,
        ruleIds: [is.meta.id],
      };
    }
  }
}

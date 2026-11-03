import { z } from 'zod';
import { validate } from '../../core/errors';
import { applyBrackets, roundEuro, safeDiv, type BracketLine } from '../../core/math';
import { IR_VERSIONS, pickVersion, type IRParams } from './rules';

/**
 * IMPÔT SUR LE REVENU — barème progressif (art. 197 CGI)
 *
 * Étapes :
 * 1. Nombre de parts (art. 194 et 195 CGI).
 * 2. Impôt = parts × Barème(R / parts).
 * 3. Plafonnement du quotient familial : l'avantage procuré par les demi-parts
 *    au-delà de 1 (célibataire) ou 2 (couple) est limité à un plafond par demi-part.
 * 4. Décote : forfait − 45,25 % × impôt, si impôt < forfait / 45,25 %.
 * 5. Contribution exceptionnelle sur les hauts revenus (CEHR), estimée sur le revenu saisi.
 *
 * Hypothèse : le revenu saisi est le REVENU NET IMPOSABLE du foyer (après abattement
 * de 10 % / frais réels et charges déductibles). Réductions et crédits d'impôt non modélisés.
 */
export const irSchema = z.object({
  netTaxableIncome: z.number({ message: 'Revenu imposable requis' }).min(0, 'Le revenu imposable doit être positif'),
  status: z.enum(['single', 'couple', 'widowed']),
  children: z.number().int().min(0).max(20),
  alternateCustodyChildren: z.number().int().min(0).max(20).default(0),
  singleParent: z.boolean().default(false),
  versionId: z.string().optional(),
  /** Revenu fiscal de référence pour la CEHR (par défaut = revenu imposable). */
  referenceIncome: z.number().min(0).optional(),
});
export type IRInput = z.input<typeof irSchema>;

/** Nombre de parts de quotient familial. */
export function computeParts(status: 'single' | 'couple' | 'widowed', children: number, alternate: number, singleParent: boolean) {
  const totalChildren = children + alternate;
  let base = status === 'couple' ? 2 : 1;
  // Veuf avec enfant(s) à charge : quotient conjugal maintenu (art. 194 CGI)
  if (status === 'widowed' && totalChildren > 0) base = 2;
  let childParts = 0;
  // Enfants à charge exclusive en premier, puis résidence alternée (art. 194 I CGI)
  for (let rank = 1; rank <= children; rank++) childParts += rank <= 2 ? 0.5 : 1;
  for (let k = 1; k <= alternate; k++) {
    const rank = children + k;
    childParts += rank <= 2 ? 0.25 : 0.5;
  }
  let singleParentBonus = 0;
  if (singleParent && status !== 'couple' && status !== 'widowed' && totalChildren > 0) {
    singleParentBonus = children > 0 ? 0.5 : 0.25; // case T (art. 194 II)
  }
  return { base, referenceParts: status === 'couple' ? 2 : 1, childParts, singleParentBonus, parts: base + childParts + singleParentBonus };
}

function grossTax(income: number, parts: number, p: IRParams) {
  const quotient = income / parts;
  const r = applyBrackets(quotient, p.brackets);
  return { tax: r.tax * parts, marginalRate: r.marginalRate, lines: r.lines.map((l) => ({ ...l, base: l.base * parts, tax: l.tax * parts })) };
}

export interface IRResult {
  parts: number;
  referenceParts: number;
  quotient: number;
  taxBeforeCap: number;
  taxReference: number;
  qfAdvantage: number;
  qfCap: number;
  qfCapped: boolean;
  taxAfterCap: number;
  decote: number;
  netIncomeTax: number;
  cehr: number;
  totalTax: number;
  marginalRate: number;
  averageRate: number;
  bracketLines: BracketLine[];
  versionId: string;
  warnings: string[];
}

export function calculateIR(raw: IRInput): IRResult {
  const i = validate(irSchema, raw);
  const version = pickVersion(IR_VERSIONS, undefined, i.versionId);
  const p = version.params;
  const warnings: string[] = [];
  const pc = computeParts(i.status, i.children, i.alternateCustodyChildren, i.singleParent);
  const R = i.netTaxableIncome;

  const withParts = grossTax(R, pc.parts, p);
  const ref = grossTax(R, pc.referenceParts, p);
  const advantage = Math.max(0, ref.tax - withParts.tax);

  // Plafond de l'avantage
  const extraHalfParts = (pc.parts - pc.referenceParts) * 2;
  let cap = extraHalfParts * p.qfHalfPartCap;
  if (pc.singleParentBonus > 0) {
    // Parent isolé : les 2 premières demi-parts (1 part) supplémentaires sont plafonnées
    // au montant spécifique ; les suivantes au plafond général.
    const firstChildHalfParts = Math.min(extraHalfParts, i.children > 0 ? 2 : 1);
    const specific = (p.qfSingleParentFirstChildCap * firstChildHalfParts) / 2;
    cap = specific + (extraHalfParts - firstChildHalfParts) * p.qfHalfPartCap;
  }
  if (i.status === 'widowed' && i.children + i.alternateCustodyChildren > 0) {
    warnings.push('Veuf avec enfants à charge : la réduction complémentaire spécifique (art. 197 I-2 CGI) n’est pas modélisée ; plafonnement calculé selon le droit commun.');
  }
  const capped = advantage > cap;
  const taxAfterCap = capped ? ref.tax - cap : withParts.tax;
  const marginalRate = capped ? ref.marginalRate : withParts.marginalRate;

  // Décote
  const forfait = i.status === 'couple' ? p.decote.couple : p.decote.single;
  const decoteLimit = forfait / p.decote.coefficient;
  let decote = 0;
  if (taxAfterCap > 0 && taxAfterCap < decoteLimit) decote = Math.min(taxAfterCap, forfait - p.decote.coefficient * taxAfterCap);
  const netIncomeTax = roundEuro(Math.max(0, taxAfterCap - decote));
  if (decote > 0) warnings.push('Foyer dans la zone de décote : le taux marginal effectif est supérieur à la TMI affichée.');
  if (netIncomeTax > 0 && netIncomeTax < 61) warnings.push('Impôt inférieur à 61 € : il n’est pas mis en recouvrement (art. 1657 CGI).');

  // CEHR (sans mécanisme de lissage ni CDHR)
  const rfr = i.referenceIncome ?? R;
  const cehr = roundEuro(applyBrackets(rfr, i.status === 'couple' ? p.cehr.couple : p.cehr.single).tax);
  if (cehr > 0) warnings.push('CEHR estimée sur le revenu saisi (RFR assimilé), sans mécanisme de lissage. La contribution différentielle sur les hauts revenus (CDHR) n’est pas calculée.');

  return {
    parts: pc.parts,
    referenceParts: pc.referenceParts,
    quotient: R / pc.parts,
    taxBeforeCap: withParts.tax,
    taxReference: ref.tax,
    qfAdvantage: advantage,
    qfCap: cap,
    qfCapped: capped,
    taxAfterCap,
    decote,
    netIncomeTax,
    cehr,
    totalTax: netIncomeTax + cehr,
    marginalRate,
    averageRate: safeDiv(netIncomeTax + cehr, R),
    bracketLines: (capped ? ref : withParts).lines,
    versionId: version.meta.id,
    warnings,
  };
}

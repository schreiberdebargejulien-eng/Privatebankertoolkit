import { z } from 'zod';
import { ValidationError, validate } from '../core/errors';
import { applyBrackets } from '../core/math';
import { GUARANTEE_VERSIONS, pickVersion } from '../tax/fr/rules';

/**
 * FRAIS DE GARANTIE D'UN CRÉDIT IMMOBILIER
 * ---------------------------------------------------------------
 * Assiette : sommes garanties = capital × (1 + accessoires), accessoires usuellement 20 %
 * (intérêts, indemnités, frais).
 * - Hypothèque conventionnelle : taxe de publicité foncière 0,715 % + CSI 0,05 % (min. 15 €)
 *   + émoluments proportionnels du notaire (HT, + TVA) + formalités et débours.
 * - HLS PD (hypothèque légale spéciale du prêteur de deniers, ex-PPD) : exonérée de TPF,
 *   limitée au prix d'un bien EXISTANT payé au moyen du prêt (hors frais, travaux, VEFA).
 * - Mixte : HLS PD sur la part finançant le prix, hypothèque conventionnelle sur le solde
 *   (un seul acte : émoluments sur l'ensemble des sommes garanties).
 */
export const guaranteeSchema = z.object({
  principal: z.number().positive('Montant emprunté requis'),
  type: z.enum(['hypotheque', 'hlspd', 'mixte']),
  /** Part du prêt finançant le prix d'un bien existant (éligible HLS PD) — mode mixte. */
  hlspdAmount: z.number().min(0).default(0),
  accessoryRate: z.number().min(0).max(0.5).default(0.2),
  /** Formalités, débours et frais divers (TTC). */
  formalities: z.number().min(0).default(0),
  date: z.string().optional(),
});
export type GuaranteeInput = z.input<typeof guaranteeSchema>;

export interface GuaranteeResult {
  type: 'hypotheque' | 'hlspd' | 'mixte';
  securedAmount: number;
  hlspdPart: number;
  mortgagePart: number;
  publicityTax: number;
  csi: number;
  notaryFeesHT: number;
  vat: number;
  formalities: number;
  total: number;
  /** Coût en % du capital emprunté. */
  ratio: number;
  ruleId: string;
}

export function calculateGuarantee(raw: GuaranteeInput): GuaranteeResult {
  const p = validate(guaranteeSchema, raw);
  const rule = pickVersion(GUARANTEE_VERSIONS, p.date);
  const g = rule.params;
  const hlspdPrincipal = p.type === 'hlspd' ? p.principal : p.type === 'mixte' ? Math.min(p.hlspdAmount, p.principal) : 0;
  if (p.type === 'mixte' && p.hlspdAmount > p.principal) throw new ValidationError(['La part couverte par l’HLS PD ne peut dépasser le montant emprunté']);
  const k = 1 + p.accessoryRate;
  const securedAmount = p.principal * k;
  const hlspdPart = hlspdPrincipal * k;
  const mortgagePart = securedAmount - hlspdPart;
  const publicityTax = mortgagePart * g.publicityTax;
  const csi = Math.max(g.csiMinimum, securedAmount * g.csiRate);
  const notaryFeesHT = applyBrackets(securedAmount, g.notaryBrackets).tax;
  const vat = notaryFeesHT * g.vat;
  const total = publicityTax + csi + notaryFeesHT + vat + p.formalities;
  return { type: p.type, securedAmount, hlspdPart, mortgagePart, publicityTax, csi, notaryFeesHT, vat, formalities: p.formalities, total, ratio: total / p.principal, ruleId: rule.meta.id };
}

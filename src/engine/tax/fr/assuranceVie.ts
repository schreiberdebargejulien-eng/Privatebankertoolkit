import { z } from 'zod';
import { ValidationError, validate } from '../../core/errors';
import { fullYearsBetween, isValidISO, parseISO } from '../../core/dates';
import { CAPITAL_TAX_VERSIONS, pickVersion } from './rules';

/**
 * FISCALITÉ D'UN RACHAT SUR ASSURANCE-VIE (art. 125-0 A CGI, BOI-RPPM-RCM-20-10-20-50)
 *
 * 1. Quote-part de produits dans le rachat : P = Rachat × (Valeur − Primes) / Valeur.
 * 2. Ventilation des produits entre primes versées avant / depuis le 27/09/2017,
 *    au prorata des primes (simplification : la ventilation exacte dépend de l'historique des produits).
 * 3. Durée du contrat appréciée à la date du rachat depuis la date de souscription (date d'effet).
 * 4. ≥ 8 ans : abattement annuel 4 600 € / 9 200 € imputé en priorité sur les produits
 *    des primes antérieures au 27/09/2017, puis sur ceux taxables à 7,5 %, puis à 12,8 %.
 * 5. Primes depuis 27/09/2017 et ≥ 8 ans : 7,5 % si le total des primes nettes ≤ 150 000 €,
 *    sinon 7,5 % sur la fraction proportionnelle et 12,8 % au-delà.
 * 6. Prélèvements sociaux : 17,2 % sur les produits (taux maintenu pour l'assurance-vie en 2026).
 */
export const lifeInsuranceSchema = z.object({
  subscriptionDate: z.string().refine(isValidISO, 'Date de souscription invalide'),
  withdrawalDate: z.string().refine(isValidISO, 'Date de rachat invalide'),
  contractValue: z.number().positive('Valeur du contrat requise'),
  withdrawalAmount: z.number().positive('Montant du rachat requis'),
  premiumsBefore2017: z.number().min(0),
  premiumsAfter2017: z.number().min(0),
  /** Primes nettes non remboursées sur les AUTRES contrats du souscripteur, au 31/12 N-1 (seuil de 150 000 €). */
  otherContractsPremiumsBefore2017: z.number().min(0).default(0),
  otherContractsPremiumsAfter2017: z.number().min(0).default(0),
  household: z.enum(['single', 'couple']),
  allowanceAlreadyUsed: z.number().min(0).default(0),
  /** Option globale pour le barème progressif (approximé au taux marginal saisi). */
  progressiveOption: z.boolean().default(false),
  marginalRate: z.number().min(0).max(0.45).default(0.3),
  /** Part des produits ayant déjà supporté les PS (fonds euros, prélevés annuellement). */
  socialAlreadyPaidShare: z.number().min(0).max(1).default(0),
});
export type LifeInsuranceInput = z.input<typeof lifeInsuranceSchema>;

export function calculateAssuranceVie(raw: LifeInsuranceInput) {
  const i = validate(lifeInsuranceSchema, raw);
  if (i.withdrawalAmount > i.contractValue + 1e-9) throw new ValidationError(['Le rachat ne peut excéder la valeur du contrat']);
  const sub = parseISO(i.subscriptionDate), wd = parseISO(i.withdrawalDate);
  if (wd < sub) throw new ValidationError(['La date de rachat doit être postérieure à la souscription']);
  const v = pickVersion(CAPITAL_TAX_VERSIONS, i.withdrawalDate);
  const p = v.params;
  const L = p.lifeInsurance;
  const warnings: string[] = [];

  const years = fullYearsBetween(sub, wd);
  const totalPremiums = i.premiumsBefore2017 + i.premiumsAfter2017;
  const totalGain = Math.max(0, i.contractValue - totalPremiums);
  const gainInWithdrawal = (i.withdrawalAmount * totalGain) / i.contractValue;
  const capitalInWithdrawal = i.withdrawalAmount - gainInWithdrawal;
  if (i.contractValue < totalPremiums) warnings.push('Contrat en moins-value : aucun produit imposable sur ce rachat.');

  const shareBefore = totalPremiums > 0 ? i.premiumsBefore2017 / totalPremiums : 0;
  const gainBefore = gainInWithdrawal * shareBefore;
  const gainAfter = gainInWithdrawal - gainBefore;

  const over8 = years >= 8;
  const allowanceTotal = over8 ? Math.max(0, (i.household === 'couple' ? L.allowanceCouple : L.allowanceSingle) - i.allowanceAlreadyUsed) : 0;

  type Line = { label: string; base: number; rate: number; tax: number };
  const lines: Line[] = [];
  let allowanceLeft = allowanceTotal;
  const takeAllowance = (amount: number) => { const u = Math.min(amount, allowanceLeft); allowanceLeft -= u; return amount - u; };

  // Primes avant 27/09/2017
  const taxableBefore = takeAllowance(gainBefore);
  if (gainBefore > 0) {
    const rate = i.progressiveOption ? i.marginalRate : years < 4 ? L.pre2017.under4 : years < 8 ? L.pre2017.from4to8 : L.pre2017.over8;
    lines.push({ label: `Produits des primes avant 27/09/2017${i.progressiveOption ? ' (barème)' : ' (PFL)'}`, base: taxableBefore, rate, tax: taxableBefore * rate });
  }

  // Primes depuis 27/09/2017
  if (gainAfter > 0) {
    if (i.progressiveOption) {
      const base = takeAllowance(gainAfter);
      lines.push({ label: 'Produits des primes depuis 27/09/2017 (barème)', base, rate: i.marginalRate, tax: base * i.marginalRate });
    } else if (!over8) {
      lines.push({ label: 'Produits des primes depuis 27/09/2017 (PFU)', base: gainAfter, rate: L.post2017.under8, tax: gainAfter * L.post2017.under8 });
    } else {
      // Seuil de 150 000 € apprécié sur l'ensemble des primes nettes (avant ET depuis 2017, tous contrats),
      // au 31/12 de l'année précédant le rachat. Au-delà, fraction à 7,5 % =
      // (150 000 − primes avant 2017) / primes depuis 2017 (art. 125-0 A, II, 2° CGI).
      const preAll = i.premiumsBefore2017 + i.otherContractsPremiumsBefore2017;
      const postAll = i.premiumsAfter2017 + i.otherContractsPremiumsAfter2017;
      const reducedShare = preAll + postAll <= L.post2017.premiumThreshold ? 1 : postAll > 0 ? Math.max(0, L.post2017.premiumThreshold - preAll) / postAll : 0;
      const reducedPart = gainAfter * reducedShare;
      const standardPart = gainAfter - reducedPart;
      const baseReduced = takeAllowance(reducedPart);
      const baseStandard = takeAllowance(standardPart);
      if (reducedPart > 0) lines.push({ label: 'Produits depuis 27/09/2017 — 7,5 % (primes ≤ 150 000 €)', base: baseReduced, rate: L.post2017.over8Reduced, tax: baseReduced * L.post2017.over8Reduced });
      if (standardPart > 0) lines.push({ label: 'Produits depuis 27/09/2017 — 12,8 % (primes > 150 000 €)', base: baseStandard, rate: L.post2017.over8Standard, tax: baseStandard * L.post2017.over8Standard });
      if (preAll + postAll > L.post2017.premiumThreshold) warnings.push(`Primes totales (${Math.round(preAll + postAll).toLocaleString('fr-FR')} €) supérieures à 150 000 € : seule une fraction des produits bénéficie du taux de 7,5 %.`);
    }
  }

  const incomeTax = lines.reduce((a, l) => a + l.tax, 0);
  const socialRate = p.socialLifeInsurance;
  const socialBase = gainInWithdrawal * (1 - i.socialAlreadyPaidShare);
  const socialTax = socialBase * socialRate;
  const net = i.withdrawalAmount - incomeTax - socialTax;

  if (over8) warnings.push('Au-delà de 8 ans, l’assureur applique à la source un prélèvement de 7,5 % (non libératoire pour les primes post-2017) ; la régularisation (abattement, 12,8 %) intervient lors de la déclaration.');
  if (!over8 && gainAfter > 0) warnings.push('Avant 8 ans : PFU de 12,8 % prélevé à la source, avec possibilité d’option globale pour le barème lors de la déclaration.');
  if (i.progressiveOption) warnings.push('Option barème approximée au taux marginal saisi ; l’option est globale pour l’ensemble des revenus de capitaux mobiliers du foyer. CSG déductible non prise en compte.');

  return {
    years,
    over8,
    totalPremiums,
    totalGain,
    gainInWithdrawal,
    capitalInWithdrawal,
    gainBefore,
    gainAfter,
    allowanceAvailable: allowanceTotal,
    allowanceUsed: allowanceTotal - allowanceLeft,
    lines,
    incomeTax,
    socialRate,
    socialBase,
    socialTax,
    totalTax: incomeTax + socialTax,
    net,
    effectiveRate: i.withdrawalAmount > 0 ? (incomeTax + socialTax) / i.withdrawalAmount : 0,
    versionId: v.meta.id,
    warnings,
  };
}

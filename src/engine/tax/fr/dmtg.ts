import { z } from 'zod';
import { validate } from '../../core/errors';
import { applyBrackets, roundEuro, type Bracket, type BracketLine } from '../../core/math';
import { DMTG_VERSIONS, DISMEMBERMENT_VERSIONS, pickVersion, type DMTGParams, type Relationship } from './rules';

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  child: 'Enfant (ligne directe)',
  grandchild: 'Petit-enfant',
  greatGrandchild: 'Arrière-petit-enfant',
  spouse: 'Époux / partenaire de PACS',
  sibling: 'Frère / sœur',
  nephew: 'Neveu / nièce',
  relative4: 'Parent jusqu’au 4e degré',
  other: 'Tiers (non-parent)',
};

export function scaleFor(rel: Relationship, p: DMTGParams): Bracket[] {
  switch (rel) {
    case 'child': case 'grandchild': case 'greatGrandchild': return p.scales.directLine;
    case 'spouse': return p.scales.spouse;
    case 'sibling': return p.scales.sibling;
    case 'nephew': case 'relative4': return p.scales.relative4;
    default: return p.scales.other;
  }
}

/**
 * Calcul des droits avec rappel fiscal (art. 784 CGI) :
 * les donations des 15 dernières années consomment d'abord l'abattement, puis les tranches
 * basses du barème. Les droits dus sur la nouvelle transmission =
 *   Barème(base antérieure + base nouvelle) − Barème(base antérieure).
 */
export function computeDuties(amount: number, allowance: number, scale: Bracket[], priorGifts = 0) {
  const allowanceLeft = Math.max(0, allowance - priorGifts);
  const allowanceUsed = Math.min(amount, allowanceLeft);
  const priorTaxable = Math.max(0, priorGifts - allowance);
  const taxableBase = Math.max(0, amount - allowanceUsed);
  const total = applyBrackets(priorTaxable + taxableBase, scale);
  const before = applyBrackets(priorTaxable, scale);
  const duties = total.tax - before.tax;
  // Détail des tranches pour la seule nouvelle transmission
  const lines: BracketLine[] = total.lines.map((l, k) => ({ ...l, base: l.base - before.lines[k].base, tax: l.tax - before.lines[k].tax })).filter((l) => l.base > 0);
  return { allowanceLeft, allowanceUsed, taxableBase, duties, marginalRate: taxableBase > 0 ? total.marginalRate : 0, lines };
}

/* ======================= DÉMEMBREMENT ======================= */
export const dismembermentSchema = z.object({
  value: z.number().min(0),
  mode: z.enum(['life', 'temporary']),
  usufructuaryAge: z.number().int().min(0).max(120).optional(),
  durationYears: z.number().int().min(1).max(99).optional(),
}).refine((v) => (v.mode === 'life' ? v.usufructuaryAge !== undefined : v.durationYears !== undefined), { message: 'Âge de l’usufruitier ou durée requis' });
export type DismembermentInput = z.input<typeof dismembermentSchema>;

/**
 * Art. 669 CGI : usufruit viager selon l'âge de l'usufruitier (âge au jour de la transmission) ;
 * usufruit temporaire : 23 % par période de 10 ans, sans fraction, plafonné à la valeur de l'usufruit viager.
 */
export function usufructRate(age: number) {
  const s = pickVersion(DISMEMBERMENT_VERSIONS).params.lifeScale;
  return s.find((x) => age < x.maxAgeExclusive)!.usufruct;
}
export function calculateDismemberment(raw: DismembermentInput) {
  const i = validate(dismembermentSchema, raw);
  const p = pickVersion(DISMEMBERMENT_VERSIONS).params;
  let rate: number;
  const notes: string[] = [];
  if (i.mode === 'life') rate = usufructRate(i.usufructuaryAge!);
  else {
    const periods = Math.ceil(i.durationYears! / 10);
    rate = Math.min(0.9, periods * p.temporaryPer10Years);
    notes.push(`Usufruit temporaire : ${periods} période(s) de 10 ans × 23 %.`);
    notes.push('Si l’usufruitier est une personne physique, la valeur ne peut excéder celle de l’usufruit viager.');
  }
  return { usufructRate: rate, bareOwnershipRate: 1 - rate, usufructValue: i.value * rate, bareOwnershipValue: i.value * (1 - rate), notes, scale: p.lifeScale };
}

/* ======================= DONATION ======================= */
export const donationSchema = z.object({
  amount: z.number().positive('Montant transmis requis'),
  relationship: z.enum(['child', 'grandchild', 'greatGrandchild', 'spouse', 'sibling', 'nephew', 'relative4', 'other']),
  donorAge: z.number().int().min(18).max(120),
  doneeAge: z.number().int().min(0).max(120),
  priorGifts: z.number().min(0).default(0),
  doneeDisabled: z.boolean().default(false),
  priorDisabilityGifts: z.number().min(0).default(0),
  ownership: z.enum(['full', 'bare']).default('full'),
  /** Don familial de sommes d'argent (art. 790 G). */
  familyCashGift: z.boolean().default(false),
  familyCashGiftAlreadyUsed: z.number().min(0).default(0),
  /** Neveu/nièce : le donateur n'a pas de descendant (condition art. 790 G). */
  donorHasNoDescendant: z.boolean().default(false),
});
export type DonationInput = z.input<typeof donationSchema>;

export function calculateDonation(raw: DonationInput) {
  const i = validate(donationSchema, raw);
  const v = pickVersion(DMTG_VERSIONS);
  const p = v.params;
  const warnings: string[] = [];

  // 1) Valeur fiscale transmise
  let taxableValue = i.amount;
  let usufruct = 0;
  if (i.ownership === 'bare') {
    usufruct = usufructRate(i.donorAge);
    taxableValue = i.amount * (1 - usufruct);
  }

  // 2) Don familial de sommes d'argent
  let familyExemption = 0;
  let familyEligible = false;
  if (i.familyCashGift) {
    const relOk = ['child', 'grandchild', 'greatGrandchild'].includes(i.relationship) || (i.relationship === 'nephew' && i.donorHasNoDescendant);
    familyEligible = relOk && i.donorAge < p.familyCashGift.donorMaxAgeExclusive && i.doneeAge >= 18 && i.ownership === 'full';
    if (familyEligible) familyExemption = Math.min(taxableValue, Math.max(0, p.familyCashGift.amount - i.familyCashGiftAlreadyUsed));
    else warnings.push('Don familial de sommes d’argent non applicable : donateur de moins de 80 ans, donataire majeur, lien enfant/petit-enfant/arrière-petit-enfant (ou neveu/nièce à défaut de descendance), en pleine propriété et en numéraire.');
  }
  const afterFamily = taxableValue - familyExemption;

  // 3) Abattement handicap (cumulable, art. 779 II)
  let disabilityUsed = 0;
  if (i.doneeDisabled) disabilityUsed = Math.min(afterFamily, Math.max(0, p.disabilityAllowance - i.priorDisabilityGifts));
  const afterDisability = afterFamily - disabilityUsed;

  // 4) Abattement personnel + rappel fiscal
  const allowance = p.donationAllowances[i.relationship];
  const scale = scaleFor(i.relationship, p);
  const d = computeDuties(afterDisability, allowance, scale, i.priorGifts);
  const duties = roundEuro(d.duties);

  if (i.priorGifts > 0) warnings.push('Rappel fiscal : les donations consenties depuis moins de 15 ans au même bénéficiaire sont prises en compte (art. 784 CGI).');
  if (i.relationship === 'spouse') warnings.push('Donation entre époux : abattement de 80 724 € ; en succession, le conjoint survivant est exonéré.');
  warnings.push('Frais de notaire et émoluments non inclus. Réduction de droits pour donation en nue-propriété non applicable (supprimée en 2011), hors cas particuliers.');

  return {
    grossValue: i.amount,
    taxableValue,
    usufructRate: usufruct,
    familyEligible,
    familyExemption,
    disabilityAllowanceUsed: disabilityUsed,
    allowance,
    allowanceLeft: d.allowanceLeft,
    allowanceUsed: d.allowanceUsed,
    taxableBase: d.taxableBase,
    duties,
    marginalRate: d.marginalRate,
    averageRate: taxableValue > 0 ? duties / taxableValue : 0,
    netReceived: i.amount - duties,
    lines: d.lines,
    versionId: v.meta.id,
    warnings,
  };
}

import { z } from 'zod';
import { ValidationError, validate } from '../../core/errors';
import { roundEuro } from '../../core/math';
import { computeDuties, scaleFor, usufructRate } from './dmtg';
import { DMTG_VERSIONS, pickVersion, type DMTGParams, type Relationship } from './rules';

/**
 * SUCCESSION — dévolution légale, legs par testament et droits.
 *
 * 1. Liquidation du régime matrimonial :
 *    - communauté (légale ou conventionnelle) : la moitié des biens communs revient au conjoint ;
 *    - séparation de biens : les biens indivis sont répartis par moitié (hypothèse) ;
 *    - communauté universelle avec attribution intégrale : rien n'entre dans la succession au 1er décès.
 * 2. Actif net successoral = biens propres + quote-part de communauté − passif.
 * 3. Dévolution légale (C. civ. art. 731 s.) :
 *    - conjoint + enfants tous communs : option usufruit total ou 1/4 en pleine propriété ;
 *    - conjoint + enfant(s) non commun(s) : 1/4 en pleine propriété ;
 *    - conjoint sans descendant : 1/2 (deux parents), 3/4 (un parent), totalité sinon ;
 *    - sans conjoint ni descendant : parents 1/4 chacun, frères et sœurs le solde.
 * 4. Legs (testament) : prélevés sur la quotité disponible (réduits à proportion s'ils l'excèdent :
 *    réserve des descendants art. 913, du conjoint à défaut de descendant art. 914-1) ; le solde
 *    suit la dévolution légale. Sans héritier légal modélisé, les legs doivent couvrir la totalité.
 * 5. Droits : conjoint et partenaire de PACS exonérés (art. 796-0 bis) ; abattements art. 779 et
 *    788 IV ; abattement handicap art. 779 II ; barème art. 777 ; rappel des donations de moins de
 *    15 ans ; valeur de la nue-propriété selon art. 669. Chaque bénéficiaire reçoit le fondement
 *    de la fiscalité appliquée (`basis`).
 */
/** Liens possibles d'un légataire (hors enfant : un enfant hérite au titre de la dévolution légale). */
export const LEGATEE_RELATIONSHIPS = ['spouse', 'grandchild', 'greatGrandchild', 'sibling', 'nephew', 'relative4', 'other'] as const;
export const legacySchema = z.object({
  label: z.string().max(60).default(''),
  relationship: z.enum(LEGATEE_RELATIONSHIPS),
  /** Part de l'actif net successoral léguée (0 à 1). */
  share: z.number().min(0).max(1),
  /** Légataire en situation de handicap (abattement art. 779 II, cumulable). */
  disabled: z.boolean().default(false),
});
export type LegacyInput = z.input<typeof legacySchema>;

export const successionSchema = z.object({
  regime: z.enum(['community', 'separation', 'universal']),
  ownAssets: z.number().min(0),
  commonAssets: z.number().min(0),
  liabilities: z.number().min(0),
  spouseAlive: z.boolean(),
  spouseAge: z.number().int().min(18).max(120).default(75),
  spouseOption: z.enum(['usufruct', 'quarter']).default('usufruct'),
  children: z.number().int().min(0).max(15),
  allChildrenCommon: z.boolean().default(true),
  priorGiftsPerChild: z.number().min(0).default(0),
  parentsAlive: z.number().int().min(0).max(2).default(0),
  siblings: z.number().int().min(0).max(15).default(0),
  siblingsExempt: z.boolean().default(false),
  legacies: z.array(legacySchema).max(12).default([]),
});
export type SuccessionInput = z.input<typeof successionSchema>;

export interface HeirResult {
  label: string;
  relationship: Relationship;
  /** Héritier légal ou légataire (testament). */
  origin: 'legal' | 'legacy';
  rights: string;
  /** Fondement de la fiscalité appliquée : lien, abattement, barème, articles. */
  basis: string;
  share: number;
  value: number;
  allowance: number;
  taxable: number;
  duties: number;
  net: number;
}

const eur = (x: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(x)} €`;
const rate = (x: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(x * 100)} %`;

/** Fondement lisible de la fiscalité appliquée à un bénéficiaire (lien, abattement, barème, articles). */
export function taxBasis(rel: Relationship, p: DMTGParams, disabled = false, priorGifts = 0): string {
  const scale = scaleFor(rel, p);
  const rates = scale.length === 1 ? `taux unique de ${rate(scale[0].rate)}` : `barème progressif de ${rate(scale[0].rate)} à ${rate(scale[scale.length - 1].rate)}`;
  const allowance = p.successionAllowances[rel];
  const head: Record<Relationship, string> = {
    child: `Ligne directe (enfant ou parent) : abattement de ${eur(allowance)} (art. 779 I CGI)`,
    grandchild: `Petit-enfant venant de son chef (légataire) : abattement général de ${eur(allowance)} (art. 788 IV CGI), barème de la ligne directe`,
    greatGrandchild: `Arrière-petit-enfant venant de son chef (légataire) : abattement général de ${eur(allowance)} (art. 788 IV CGI), barème de la ligne directe`,
    spouse: 'Conjoint ou partenaire de PACS : exonéré (art. 796-0 bis CGI)',
    sibling: `Frère ou sœur : abattement de ${eur(allowance)} (art. 779 IV CGI)`,
    nephew: `Neveu ou nièce : abattement de ${eur(allowance)} (art. 779 V CGI)`,
    relative4: `Parent jusqu’au 4e degré (cousin germain, oncle, tante…) : abattement général de ${eur(allowance)} (art. 788 IV CGI)`,
    other: `Non-parent ou parent au-delà du 4e degré : abattement général de ${eur(allowance)} (art. 788 IV CGI)`,
  };
  const parts = [`${head[rel]}, ${rates} (art. 777 CGI).`];
  if (disabled) parts.push(`Abattement handicap de ${eur(p.disabilityAllowance)} cumulé (art. 779 II CGI).`);
  if (priorGifts > 0) parts.push(`Donations de moins de ${p.recallYears} ans rappelées (art. 784 CGI) : ${eur(priorGifts)}.`);
  return parts.join(' ');
}

export function calculateSuccession(raw: SuccessionInput) {
  const i = validate(successionSchema, raw);
  const p = pickVersion(DMTG_VERSIONS).params;
  const warnings: string[] = [];

  // 1. Liquidation
  let communityShare = 0;
  if (i.regime === 'community' || i.regime === 'separation') communityShare = i.commonAssets / 2;
  if (i.regime === 'universal' && !i.spouseAlive) communityShare = i.commonAssets; // pas d'attribution sans conjoint survivant
  const universalToSpouse = i.regime === 'universal' && i.spouseAlive;
  const grossEstate = universalToSpouse ? 0 : i.ownAssets + communityShare;
  const netEstate = Math.max(0, grossEstate - i.liabilities);
  if (universalToSpouse) warnings.push('Communauté universelle avec attribution intégrale : le conjoint recueille l’ensemble des biens communs hors succession ; les enfants hériteront au second décès (sans pouvoir utiliser l’abattement sur la succession du premier). Les biens propres éventuels sont ici supposés inexistants.');

  // Réserve et quotité disponible (descendants : art. 913 ; conjoint sans descendant : 1/4, art. 914-1)
  const n = i.children;
  const spouseReserve = n === 0 && i.spouseAlive && !universalToSpouse ? 1 / 4 : 0;
  const reserveRate = n === 0 ? spouseReserve : n === 1 ? 1 / 2 : n === 2 ? 2 / 3 : 3 / 4;
  const reserve = netEstate * reserveRate;
  const available = netEstate - reserve;

  const heirs: HeirResult[] = [];
  const addHeir = (label: string, rel: Relationship, rights: string, share: number, value: number, prior = 0, exempt = false, origin: 'legal' | 'legacy' = 'legal', disabled = false) => {
    if (exempt || rel === 'spouse') {
      const basis = rel === 'spouse'
        ? 'Exonéré : conjoint survivant ou partenaire de PACS (art. 796-0 bis CGI).'
        : 'Exonéré : frère ou sœur remplissant les conditions de l’art. 796-0 ter CGI (célibataire, veuf, divorcé ou séparé, plus de 50 ans ou infirme, domicilié avec le défunt les 5 années précédant le décès).';
      heirs.push({ label, relationship: rel, origin, rights, basis, share, value, allowance: 0, taxable: 0, duties: 0, net: value });
      return;
    }
    const allowance = p.successionAllowances[rel] + (disabled ? p.disabilityAllowance : 0);
    const d = computeDuties(value, allowance, scaleFor(rel, p), prior);
    const duties = roundEuro(d.duties);
    const basis = taxBasis(rel, p, disabled, prior);
    heirs.push({ label, relationship: rel, origin, rights, basis, share, value, allowance: d.allowanceUsed, taxable: d.taxableBase, duties, net: value - duties });
  };

  // Legs : prélevés sur la quotité disponible, réduits à proportion s'ils l'excèdent
  const requested = i.legacies.reduce((a, l) => a + l.share, 0);
  const maxLegacies = universalToSpouse ? 0 : 1 - reserveRate;
  const reduction = requested > maxLegacies + 1e-9 ? maxLegacies / requested : 1;
  if (i.legacies.length && universalToSpouse) warnings.push('Communauté universelle avec attribution intégrale : aucun bien n’entre dans la succession au 1er décès ; les legs sont sans objet.');
  else if (reduction < 1) warnings.push(`Legs réduits à la quotité disponible (${rate(maxLegacies)} de l’actif net) : ${rate(requested)} légués. Les héritiers réservataires peuvent demander la réduction (art. 920 C. civ.) ; elle est appliquée ici à proportion de chaque legs.`);
  if (requested > 1 + 1e-9) warnings.push('La somme des parts léguées dépasse 100 %.');
  const legacyShare = universalToSpouse ? 0 : Math.min(requested * reduction, 1);
  i.legacies.forEach((l, k) => {
    const share = universalToSpouse ? 0 : l.share * reduction;
    if (share <= 0) return;
    const name = l.label.trim() || `Légataire ${k + 1}`;
    addHeir(name, l.relationship, `Legs de ${rate(share)} (testament)`, share, netEstate * share, 0, false, 'legacy', l.disabled);
  });
  // Le solde suit la dévolution légale
  const remainderRate = 1 - legacyShare;
  const estate = netEstate * remainderRate;
  const remainderNote = legacyShare > 0 ? ' du solde' : '';

  let usufruct = 0;
  const firstLegal = heirs.length;
  if (!universalToSpouse && estate > 0) {
    if (n > 0) {
      if (i.spouseAlive) {
        const option = i.allChildrenCommon ? i.spouseOption : 'quarter';
        if (!i.allChildrenCommon && i.spouseOption === 'usufruct') warnings.push('Enfant(s) non commun(s) : le conjoint ne peut opter pour l’usufruit ; il reçoit 1/4 en pleine propriété (art. 757 C. civ.).');
        if (option === 'usufruct') {
          usufruct = usufructRate(i.spouseAge);
          addHeir('Conjoint survivant', 'spouse', `Usufruit total (${Math.round(usufruct * 100)} % — art. 669)`, usufruct, estate * usufruct, 0, true);
          const np = (estate * (1 - usufruct)) / n;
          for (let k = 1; k <= n; k++) addHeir(`Enfant ${k}`, 'child', `Nue-propriété 1/${n}`, (1 - usufruct) / n, np, i.priorGiftsPerChild);
        } else {
          addHeir('Conjoint survivant', 'spouse', '1/4 en pleine propriété', 0.25, estate * 0.25, 0, true);
          for (let k = 1; k <= n; k++) addHeir(`Enfant ${k}`, 'child', `Pleine propriété 3/${4 * n}`, 0.75 / n, (estate * 0.75) / n, i.priorGiftsPerChild);
        }
      } else {
        for (let k = 1; k <= n; k++) addHeir(`Enfant ${k}`, 'child', `Pleine propriété 1/${n}`, 1 / n, estate / n, i.priorGiftsPerChild);
      }
    } else if (i.spouseAlive) {
      const parentShare = i.parentsAlive === 2 ? 0.25 : i.parentsAlive === 1 ? 0.25 : 0;
      const spouseShare = 1 - parentShare * i.parentsAlive;
      addHeir('Conjoint survivant', 'spouse', `${spouseShare === 1 ? 'Totalité' : spouseShare === 0.5 ? '1/2' : '3/4'} en pleine propriété`, spouseShare, estate * spouseShare, 0, true);
      for (let k = 1; k <= i.parentsAlive; k++) addHeir(`Parent ${k}`, 'child', '1/4 en pleine propriété', 0.25, estate * 0.25);
      if (i.siblings > 0) warnings.push('En présence d’un conjoint et sans descendant, les frères et sœurs n’héritent pas (hors droit de retour légal sur les biens de famille, non modélisé).');
    } else {
      if (i.parentsAlive === 0 && i.siblings === 0) throw new ValidationError([legacyShare > 0
        ? `Sans héritier légal modélisé, les legs doivent couvrir la totalité de la succession (${rate(legacyShare)} légués) : ajoutez un légataire universel ou complétez les parts. À défaut, le solde reviendrait aux ascendants ordinaires, aux collatéraux jusqu’au 6e degré ou à l’État.`
        : 'Aucun héritier : indiquez un parent, un frère ou une sœur, ou ajoutez des légataires (testament). Dévolution aux ascendants ordinaires et collatéraux éloignés non modélisée.']);
      if (i.siblings === 0) {
        for (let k = 1; k <= i.parentsAlive; k++) addHeir(`Parent ${k}`, 'child', `1/${i.parentsAlive} en pleine propriété`, 1 / i.parentsAlive, estate / i.parentsAlive);
      } else {
        const parentsTotal = 0.25 * i.parentsAlive;
        for (let k = 1; k <= i.parentsAlive; k++) addHeir(`Parent ${k}`, 'child', '1/4 en pleine propriété', 0.25, estate * 0.25);
        const sib = (1 - parentsTotal) / i.siblings;
        for (let k = 1; k <= i.siblings; k++) addHeir(`Frère / sœur ${k}`, 'sibling', `Pleine propriété`, sib, estate * sib, 0, i.siblingsExempt);
        if (i.siblingsExempt) warnings.push('Exonération des frères et sœurs (art. 796-0 ter) : célibataire/veuf/divorcé/séparé, âgé de plus de 50 ans ou infirme, domicilié avec le défunt pendant les 5 années précédant le décès.');
      }
    }
  }
  for (let k = firstLegal; k < heirs.length; k++) {
    heirs[k].share *= remainderRate;
    if (remainderNote) heirs[k].rights += remainderNote;
  }

  const totalDuties = heirs.reduce((a, h) => a + h.duties, 0);
  if (i.priorGiftsPerChild > 0) warnings.push('Donations de moins de 15 ans rapportées fiscalement sur l’abattement de chaque enfant.');
  if (legacyShare > 0) warnings.push('Legs : solde attribué selon la dévolution légale, calculée sur le solde (simplification : imputation des libéralités sur les droits du conjoint non modélisée, art. 758-6 C. civ.). Legs nets de droits supposés (pas de clause de prise en charge des droits par la succession).');
  warnings.push(`${legacyShare > 0 ? 'Donation au dernier vivant non modélisée.' : 'Dévolution légale sans testament ni donation entre époux.'} Assurance-vie hors succession (art. 990 I / 757 B CGI) non intégrée. Frais de notaire non inclus.`);

  return {
    communityShare,
    grossEstate,
    netEstate,
    reserveRate,
    reserve,
    available,
    legacyShare,
    legacyReduction: reduction,
    usufruct,
    heirs,
    totalDuties,
    netTransmitted: netEstate - totalDuties,
    averageRate: netEstate > 0 ? totalDuties / netEstate : 0,
    warnings,
  };
}

import { z } from 'zod';
import { ValidationError, validate } from '../../core/errors';
import { roundEuro } from '../../core/math';
import { computeDuties, scaleFor, usufructRate } from './dmtg';
import { DMTG_VERSIONS, pickVersion, type Relationship } from './rules';

/**
 * SUCCESSION — dévolution légale (sans testament ni donation au dernier vivant) et droits.
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
 * 4. Droits : conjoint exonéré (art. 796-0 bis) ; abattements art. 779 ; barème art. 777 ;
 *    rappel des donations de moins de 15 ans ; valeur de la nue-propriété selon art. 669.
 */
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
});
export type SuccessionInput = z.input<typeof successionSchema>;

export interface HeirResult {
  label: string;
  relationship: Relationship;
  rights: string;
  share: number;
  value: number;
  allowance: number;
  taxable: number;
  duties: number;
  net: number;
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

  // Réserve et quotité disponible
  const n = i.children;
  const reserveRate = n === 0 ? 0 : n === 1 ? 1 / 2 : n === 2 ? 2 / 3 : 3 / 4;
  const reserve = netEstate * reserveRate;
  const available = netEstate - reserve;

  const heirs: HeirResult[] = [];
  const addHeir = (label: string, rel: Relationship, rights: string, share: number, value: number, prior = 0, exempt = false) => {
    if (exempt) {
      heirs.push({ label, relationship: rel, rights, share, value, allowance: 0, taxable: 0, duties: 0, net: value });
      return;
    }
    const allowance = rel === 'spouse' ? Infinity : p.successionAllowances[rel];
    const d = computeDuties(value, allowance, scaleFor(rel, p), prior);
    const duties = roundEuro(d.duties);
    heirs.push({ label, relationship: rel, rights, share, value, allowance: d.allowanceUsed, taxable: d.taxableBase, duties, net: value - duties });
  };

  let usufruct = 0;
  if (!universalToSpouse) {
    if (n > 0) {
      if (i.spouseAlive) {
        const option = i.allChildrenCommon ? i.spouseOption : 'quarter';
        if (!i.allChildrenCommon && i.spouseOption === 'usufruct') warnings.push('Enfant(s) non commun(s) : le conjoint ne peut opter pour l’usufruit ; il reçoit 1/4 en pleine propriété (art. 757 C. civ.).');
        if (option === 'usufruct') {
          usufruct = usufructRate(i.spouseAge);
          addHeir('Conjoint survivant', 'spouse', `Usufruit total (${Math.round(usufruct * 100)} % — art. 669)`, usufruct, netEstate * usufruct, 0, true);
          const np = (netEstate * (1 - usufruct)) / n;
          for (let k = 1; k <= n; k++) addHeir(`Enfant ${k}`, 'child', `Nue-propriété 1/${n}`, (1 - usufruct) / n, np, i.priorGiftsPerChild);
        } else {
          addHeir('Conjoint survivant', 'spouse', '1/4 en pleine propriété', 0.25, netEstate * 0.25, 0, true);
          for (let k = 1; k <= n; k++) addHeir(`Enfant ${k}`, 'child', `Pleine propriété 3/${4 * n}`, 0.75 / n, (netEstate * 0.75) / n, i.priorGiftsPerChild);
        }
      } else {
        for (let k = 1; k <= n; k++) addHeir(`Enfant ${k}`, 'child', `Pleine propriété 1/${n}`, 1 / n, netEstate / n, i.priorGiftsPerChild);
      }
    } else if (i.spouseAlive) {
      const parentShare = i.parentsAlive === 2 ? 0.25 : i.parentsAlive === 1 ? 0.25 : 0;
      const spouseShare = 1 - parentShare * i.parentsAlive;
      addHeir('Conjoint survivant', 'spouse', `${spouseShare === 1 ? 'Totalité' : spouseShare === 0.5 ? '1/2' : '3/4'} en pleine propriété`, spouseShare, netEstate * spouseShare, 0, true);
      for (let k = 1; k <= i.parentsAlive; k++) addHeir(`Parent ${k}`, 'child', '1/4 en pleine propriété', 0.25, netEstate * 0.25);
      if (i.siblings > 0) warnings.push('En présence d’un conjoint et sans descendant, les frères et sœurs n’héritent pas (hors droit de retour légal sur les biens de famille, non modélisé).');
    } else {
      if (i.parentsAlive === 0 && i.siblings === 0) throw new ValidationError(['Dévolution aux ascendants ordinaires et collatéraux éloignés non modélisée : précisez au moins un parent ou un frère/sœur.']);
      if (i.siblings === 0) {
        for (let k = 1; k <= i.parentsAlive; k++) addHeir(`Parent ${k}`, 'child', `1/${i.parentsAlive} en pleine propriété`, 1 / i.parentsAlive, netEstate / i.parentsAlive);
      } else {
        const parentsTotal = 0.25 * i.parentsAlive;
        for (let k = 1; k <= i.parentsAlive; k++) addHeir(`Parent ${k}`, 'child', '1/4 en pleine propriété', 0.25, netEstate * 0.25);
        const sib = (1 - parentsTotal) / i.siblings;
        for (let k = 1; k <= i.siblings; k++) addHeir(`Frère / sœur ${k}`, 'sibling', `Pleine propriété`, sib, netEstate * sib, 0, i.siblingsExempt);
        if (i.siblingsExempt) warnings.push('Exonération des frères et sœurs (art. 796-0 ter) : célibataire/veuf/divorcé/séparé, âgé de plus de 50 ans ou infirme, domicilié avec le défunt pendant les 5 années précédant le décès.');
      }
    }
  }

  const totalDuties = heirs.reduce((a, h) => a + h.duties, 0);
  if (i.priorGiftsPerChild > 0) warnings.push('Donations de moins de 15 ans rapportées fiscalement sur l’abattement de chaque enfant.');
  warnings.push('Dévolution légale sans testament ni donation entre époux. Assurance-vie hors succession (art. 990 I / 757 B CGI) non intégrée. Frais de notaire non inclus.');

  return {
    communityShare,
    grossEstate,
    netEstate,
    reserveRate,
    reserve,
    available,
    usufruct,
    heirs,
    totalDuties,
    netTransmitted: netEstate - totalDuties,
    averageRate: netEstate > 0 ? totalDuties / netEstate : 0,
    warnings,
  };
}

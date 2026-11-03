/**
 * RÈGLES FISCALES FRANÇAISES — VERSIONNÉES
 * -------------------------------------------------------------
 * Aucun taux n'est codé en dur dans les moteurs : tous les paramètres sont ici,
 * versionnés par date d'effet, avec sources et date de vérification.
 * Pour ajouter un millésime : dupliquer la dernière version, mettre à jour
 * `params`, `meta.effectiveFrom`, `meta.sources`, `meta.lastVerified`, `meta.status`.
 */
import type { Bracket } from '../../core/math';
import type { Versioned } from '../types';

const LEGIFRANCE_CGI = 'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006069577';
const VERIFIED = '2026-11-03';

/* ===================== IMPÔT SUR LE REVENU ===================== */
export interface IRParams {
  brackets: Bracket[];
  /** Plafond de l'avantage par demi-part (art. 197, I-2 CGI). */
  qfHalfPartCap: number;
  /** Plafond pour la 1re part de l'enfant d'un parent isolé (case T). */
  qfSingleParentFirstChildCap: number;
  /** Décote (art. 197, I-4 CGI) : forfait − coeff × impôt brut. */
  decote: { single: number; couple: number; coefficient: number };
  /** Contribution exceptionnelle sur les hauts revenus (art. 223 sexies CGI). */
  cehr: { single: Bracket[]; couple: Bracket[] };
}

export const IR_VERSIONS: Versioned<IRParams>[] = [
  {
    meta: {
      id: 'FR-IR-2025',
      jurisdiction: 'FR',
      label: 'Barème IR 2025 (revenus 2024)',
      effectiveFrom: '2025-01-01',
      scope: 'Revenus 2024 — impôt payé en 2025',
      sources: [
        { label: 'Art. 197 CGI — Légifrance', url: LEGIFRANCE_CGI },
        { label: 'BOFiP BOI-IR-LIQ-20-10', url: 'https://bofip.impots.gouv.fr/bofip/2491-PGP.html' },
        { label: 'impots.gouv.fr — barème', url: 'https://www.impots.gouv.fr/particulier/questions/comment-calculer-mon-taux-dimposition-dapres-le-bareme-progressif-de-limpot' },
      ],
      lastVerified: VERIFIED,
      status: 'official',
      notes: ['Loi de finances pour 2025 (loi n° 2025-127 du 14 février 2025) : revalorisation de 1,8 %.'],
    },
    params: {
      brackets: [
        { from: 0, to: 11_497, rate: 0 },
        { from: 11_497, to: 29_315, rate: 0.11 },
        { from: 29_315, to: 83_823, rate: 0.3 },
        { from: 83_823, to: 180_294, rate: 0.41 },
        { from: 180_294, to: null, rate: 0.45 },
      ],
      qfHalfPartCap: 1_791,
      qfSingleParentFirstChildCap: 4_224,
      decote: { single: 889, couple: 1_470, coefficient: 0.4525 },
      cehr: {
        single: [{ from: 0, to: 250_000, rate: 0 }, { from: 250_000, to: 500_000, rate: 0.03 }, { from: 500_000, to: null, rate: 0.04 }],
        couple: [{ from: 0, to: 500_000, rate: 0 }, { from: 500_000, to: 1_000_000, rate: 0.03 }, { from: 1_000_000, to: null, rate: 0.04 }],
      },
    },
  },
  {
    meta: {
      id: 'FR-IR-2026',
      jurisdiction: 'FR',
      label: 'Barème IR 2026 (revenus 2025)',
      effectiveFrom: '2026-01-01',
      scope: 'Revenus 2025 — impôt payé en 2026',
      sources: [
        { label: 'Art. 197 CGI — Légifrance', url: LEGIFRANCE_CGI },
        { label: 'BOFiP BOI-IR-LIQ-20-20-20 (plafonnement QF)', url: 'https://bofip.impots.gouv.fr/bofip/2494-PGP.html' },
        { label: 'Brochure pratique IR 2026 — impots.gouv.fr', url: 'https://www.impots.gouv.fr/www2/fichiers/documentation/brochure/ir_2026/pdf_som/21-calcul_impot_369a382.pdf' },
      ],
      lastVerified: VERIFIED,
      status: 'cross-checked',
      notes: [
        'Loi de finances pour 2026 : revalorisation de 0,9 % des tranches, plafonds et décote.',
        'Montants de la décote (897 € / 1 483 €) recoupés sur sources secondaires : à confirmer sur la brochure officielle.',
      ],
    },
    params: {
      brackets: [
        { from: 0, to: 11_600, rate: 0 },
        { from: 11_600, to: 29_579, rate: 0.11 },
        { from: 29_579, to: 84_577, rate: 0.3 },
        { from: 84_577, to: 181_917, rate: 0.41 },
        { from: 181_917, to: null, rate: 0.45 },
      ],
      qfHalfPartCap: 1_807,
      qfSingleParentFirstChildCap: 4_262,
      decote: { single: 897, couple: 1_483, coefficient: 0.4525 },
      cehr: {
        single: [{ from: 0, to: 250_000, rate: 0 }, { from: 250_000, to: 500_000, rate: 0.03 }, { from: 500_000, to: null, rate: 0.04 }],
        couple: [{ from: 0, to: 500_000, rate: 0 }, { from: 500_000, to: 1_000_000, rate: 0.03 }, { from: 1_000_000, to: null, rate: 0.04 }],
      },
    },
  },
];

/* ===================== IFI ===================== */
export interface IFIParams {
  threshold: number;
  brackets: Bracket[];
  /** Décote (art. 977 CGI) applicable si patrimoine net ∈ [threshold ; decoteCeiling]. */
  decote: { ceiling: number; fixed: number; rate: number };
  mainResidenceAllowance: number;
  /** Plafonnement IR + IFI ≤ x % des revenus (art. 979 CGI). */
  capRatio: number;
  /** Limitation des dettes (art. 974 CGI) : au-delà de 60 % de l'actif si actif > 5 M€, déductibilité à 50 %. */
  debtLimitation: { assetThreshold: number; ratio: number; excessDeductibleShare: number };
}
const IFI_PARAMS: IFIParams = {
  threshold: 1_300_000,
  brackets: [
    { from: 0, to: 800_000, rate: 0 },
    { from: 800_000, to: 1_300_000, rate: 0.005 },
    { from: 1_300_000, to: 2_570_000, rate: 0.007 },
    { from: 2_570_000, to: 5_000_000, rate: 0.01 },
    { from: 5_000_000, to: 10_000_000, rate: 0.0125 },
    { from: 10_000_000, to: null, rate: 0.015 },
  ],
  decote: { ceiling: 1_400_000, fixed: 17_500, rate: 0.0125 },
  mainResidenceAllowance: 0.3,
  capRatio: 0.75,
  debtLimitation: { assetThreshold: 5_000_000, ratio: 0.6, excessDeductibleShare: 0.5 },
};
export const IFI_VERSIONS: Versioned<IFIParams>[] = [
  {
    meta: {
      id: 'FR-IFI-2018',
      jurisdiction: 'FR',
      label: 'IFI — barème en vigueur depuis 2018',
      effectiveFrom: '2018-01-01',
      scope: 'Patrimoine au 1er janvier de l’année d’imposition',
      sources: [
        { label: 'Art. 964 à 983 CGI — Légifrance', url: LEGIFRANCE_CGI },
        { label: 'BOFiP BOI-PAT-IFI', url: 'https://bofip.impots.gouv.fr/bofip/11320-PGP.html' },
        { label: 'service-public.fr — IFI', url: 'https://www.service-public.fr/particuliers/vosdroits/F563' },
      ],
      lastVerified: VERIFIED,
      status: 'official',
      notes: ['Barème inchangé depuis la création de l’IFI (LF 2018).'],
    },
    params: IFI_PARAMS,
  },
];

/* ===================== PRÉLÈVEMENTS SOCIAUX & PFU ===================== */
export interface CapitalTaxParams {
  /** Taux global des prélèvements sociaux sur revenus du capital (intérêts, dividendes, PV mobilières). */
  socialGeneral: number;
  /** PS sur produits d'assurance-vie / capitalisation et PER assurantiel. */
  socialLifeInsurance: number;
  /** PS sur revenus fonciers et PV immobilières. */
  socialRealEstate: number;
  /** Taux d'IR du PFU (art. 200 A CGI). */
  pfuIncomeTax: number;
  /** Assurance-vie (art. 125-0 A CGI). */
  lifeInsurance: {
    allowanceSingle: number;
    allowanceCouple: number;
    /** Primes versées avant le 27/09/2017 — PFL libératoire optionnel. */
    pre2017: { under4: number; from4to8: number; over8: number };
    /** Primes versées depuis le 27/09/2017. */
    post2017: { under8: number; over8Reduced: number; over8Standard: number; premiumThreshold: number };
  };
}
const LI = {
  allowanceSingle: 4_600,
  allowanceCouple: 9_200,
  pre2017: { under4: 0.35, from4to8: 0.15, over8: 0.075 },
  post2017: { under8: 0.128, over8Reduced: 0.075, over8Standard: 0.128, premiumThreshold: 150_000 },
};
export const CAPITAL_TAX_VERSIONS: Versioned<CapitalTaxParams>[] = [
  {
    meta: {
      id: 'FR-CAP-2018',
      jurisdiction: 'FR',
      label: 'PFU 30 % — PS 17,2 %',
      effectiveFrom: '2018-01-01',
      scope: 'Revenus perçus du 01/01/2018 au 31/12/2025',
      sources: [
        { label: 'Art. 200 A et 125-0 A CGI', url: LEGIFRANCE_CGI },
        { label: 'BOFiP BOI-RPPM-RCM-20-10-20-50 (assurance-vie)', url: 'https://bofip.impots.gouv.fr/bofip/11259-PGP.html' },
      ],
      lastVerified: VERIFIED,
      status: 'official',
    },
    params: { socialGeneral: 0.172, socialLifeInsurance: 0.172, socialRealEstate: 0.172, pfuIncomeTax: 0.128, lifeInsurance: LI },
  },
  {
    meta: {
      id: 'FR-CAP-2026',
      jurisdiction: 'FR',
      label: 'PFU 31,4 % — PS 18,6 % (hors assurance-vie, foncier)',
      effectiveFrom: '2026-01-01',
      scope: 'Produits de placement perçus à compter du 01/01/2026',
      sources: [
        { label: 'LFSS 2026 (loi n° 2025-1403) — art. L136-8 CSS', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006740127' },
        { label: 'Art. 200 A CGI', url: LEGIFRANCE_CGI },
      ],
      lastVerified: VERIFIED,
      status: 'cross-checked',
      notes: [
        'Hausse de 1,4 pt de la CSG sur les revenus du capital (9,2 % → 10,6 %).',
        'Exclusions (taux 17,2 % maintenu) : assurance-vie et capitalisation, PER assurantiels, épargne logement, revenus fonciers, PV immobilières.',
        'Revenus du patrimoine (foncier…) : le taux applicable dépend de la catégorie — se référer à l’art. L136-8 IV CSS.',
      ],
    },
    params: { socialGeneral: 0.186, socialLifeInsurance: 0.172, socialRealEstate: 0.172, pfuIncomeTax: 0.128, lifeInsurance: LI },
  },
];

/* ===================== PER ===================== */
export interface PERParams {
  /** PASS de l'année N-1 servant au calcul du plafond des versements de l'année N. */
  passPreviousYear: number;
  rate: number; // 10 %
  maxMultiple: number; // 8 PASS
  /** Fractions imposables des rentes viagères à titre onéreux (art. 158, 6 CGI) pour PS. */
  rvtoFractions: { maxAgeExclusive: number; fraction: number }[];
  pensionAllowance: number; // abattement 10 % pensions
}
export const PER_VERSIONS: Versioned<PERParams>[] = [
  {
    meta: {
      id: 'FR-PER-2025',
      jurisdiction: 'FR',
      label: 'Plafond épargne retraite 2025 (PASS 2024 : 46 368 €)',
      effectiveFrom: '2025-01-01',
      scope: 'Versements effectués en 2025',
      sources: [
        { label: 'Art. 163 quatervicies CGI', url: LEGIFRANCE_CGI },
        { label: 'service-public.fr — PER', url: 'https://www.service-public.fr/particuliers/vosdroits/F36526' },
      ],
      lastVerified: VERIFIED,
      status: 'official',
    },
    params: {
      passPreviousYear: 46_368, rate: 0.1, maxMultiple: 8, pensionAllowance: 0.1,
      rvtoFractions: [{ maxAgeExclusive: 50, fraction: 0.7 }, { maxAgeExclusive: 60, fraction: 0.5 }, { maxAgeExclusive: 70, fraction: 0.4 }, { maxAgeExclusive: 999, fraction: 0.3 }],
    },
  },
  {
    meta: {
      id: 'FR-PER-2026',
      jurisdiction: 'FR',
      label: 'Plafond épargne retraite 2026 (PASS 2025 : 47 100 €)',
      effectiveFrom: '2026-01-01',
      scope: 'Versements effectués en 2026',
      sources: [
        { label: 'Art. 163 quatervicies CGI', url: LEGIFRANCE_CGI },
        { label: 'service-public.fr — PER', url: 'https://www.service-public.fr/particuliers/vosdroits/F36526' },
      ],
      lastVerified: VERIFIED,
      status: 'official',
      notes: ['Plafond maximum : 10 % × 8 × 47 100 = 37 680 € ; plancher : 10 % × 47 100 = 4 710 €.'],
    },
    params: {
      passPreviousYear: 47_100, rate: 0.1, maxMultiple: 8, pensionAllowance: 0.1,
      rvtoFractions: [{ maxAgeExclusive: 50, fraction: 0.7 }, { maxAgeExclusive: 60, fraction: 0.5 }, { maxAgeExclusive: 70, fraction: 0.4 }, { maxAgeExclusive: 999, fraction: 0.3 }],
    },
  },
];

/* ===================== DMTG : DONATIONS & SUCCESSIONS ===================== */
export type Relationship =
  | 'child' // enfant / parent (ligne directe)
  | 'grandchild'
  | 'greatGrandchild'
  | 'spouse' // époux / partenaire de PACS
  | 'sibling'
  | 'nephew' // neveu / nièce
  | 'relative4' // parent jusqu'au 4e degré
  | 'other'; // au-delà / non-parent

export interface DMTGParams {
  scales: { directLine: Bracket[]; spouse: Bracket[]; sibling: Bracket[]; relative4: Bracket[]; other: Bracket[] };
  donationAllowances: Record<Relationship, number>;
  successionAllowances: Record<Relationship, number>;
  disabilityAllowance: number;
  /** Abattement général successions (art. 788 IV) à défaut d'autre abattement. */
  defaultSuccessionAllowance: number;
  /** Don familial de sommes d'argent (art. 790 G). */
  familyCashGift: { amount: number; donorMaxAgeExclusive: number };
  recallYears: number;
}
const directLine: Bracket[] = [
  { from: 0, to: 8_072, rate: 0.05 },
  { from: 8_072, to: 12_109, rate: 0.1 },
  { from: 12_109, to: 15_932, rate: 0.15 },
  { from: 15_932, to: 552_324, rate: 0.2 },
  { from: 552_324, to: 902_838, rate: 0.3 },
  { from: 902_838, to: 1_805_677, rate: 0.4 },
  { from: 1_805_677, to: null, rate: 0.45 },
];
const spouseScale: Bracket[] = [
  { from: 0, to: 8_072, rate: 0.05 },
  { from: 8_072, to: 15_862, rate: 0.1 },
  { from: 15_862, to: 31_228, rate: 0.15 },
  { from: 31_228, to: 552_324, rate: 0.2 },
  { from: 552_324, to: 902_838, rate: 0.3 },
  { from: 902_838, to: 1_805_677, rate: 0.4 },
  { from: 1_805_677, to: null, rate: 0.45 },
];
export const DMTG_VERSIONS: Versioned<DMTGParams>[] = [
  {
    meta: {
      id: 'FR-DMTG-2011',
      jurisdiction: 'FR',
      label: 'Droits de mutation à titre gratuit (barèmes et abattements en vigueur)',
      effectiveFrom: '2012-08-17',
      scope: 'Donations et successions',
      sources: [
        { label: 'Art. 777, 779, 784, 788, 790 B à 790 G CGI', url: LEGIFRANCE_CGI },
        { label: 'service-public.fr — droits de donation', url: 'https://www.service-public.fr/particuliers/vosdroits/F14203' },
        { label: 'service-public.fr — droits de succession', url: 'https://www.service-public.fr/particuliers/vosdroits/F35794' },
        { label: 'BOFiP BOI-ENR-DMTG', url: 'https://bofip.impots.gouv.fr/bofip/5739-PGP.html' },
      ],
      lastVerified: VERIFIED,
      status: 'official',
      notes: [
        'Abattements non revalorisés depuis 2012, barèmes depuis 2011.',
        'Exonération temporaire art. 790 A bis (dons pour construction / rénovation, jusqu’au 31/12/2026) non intégrée au calcul automatique.',
      ],
    },
    params: {
      scales: {
        directLine,
        spouse: spouseScale,
        sibling: [{ from: 0, to: 24_430, rate: 0.35 }, { from: 24_430, to: null, rate: 0.45 }],
        relative4: [{ from: 0, to: null, rate: 0.55 }],
        other: [{ from: 0, to: null, rate: 0.6 }],
      },
      donationAllowances: { child: 100_000, grandchild: 31_865, greatGrandchild: 5_310, spouse: 80_724, sibling: 15_932, nephew: 7_967, relative4: 0, other: 0 },
      successionAllowances: { child: 100_000, grandchild: 1_594, greatGrandchild: 1_594, spouse: Infinity, sibling: 15_932, nephew: 7_967, relative4: 1_594, other: 1_594 },
      disabilityAllowance: 159_325,
      defaultSuccessionAllowance: 1_594,
      familyCashGift: { amount: 31_865, donorMaxAgeExclusive: 80 },
      recallYears: 15,
    },
  },
];

/* ===================== DÉMEMBREMENT (art. 669 CGI) ===================== */
export interface DismembermentParams {
  /** Barème viager : âge de l'usufruitier strictement inférieur à `maxAgeExclusive` → % usufruit. */
  lifeScale: { maxAgeExclusive: number; usufruct: number }[];
  /** Usufruit temporaire : x % par période de 10 ans (fraction comptée pour une période). */
  temporaryPer10Years: number;
}
export const DISMEMBERMENT_VERSIONS: Versioned<DismembermentParams>[] = [
  {
    meta: {
      id: 'FR-669-2004',
      jurisdiction: 'FR',
      label: 'Barème fiscal de l’usufruit — art. 669 CGI',
      effectiveFrom: '2004-01-01',
      scope: 'Évaluation fiscale (DMTG, IFI)',
      sources: [{ label: 'Art. 669 CGI — Légifrance', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006305440' }],
      lastVerified: VERIFIED,
      status: 'official',
    },
    params: {
      lifeScale: [
        { maxAgeExclusive: 21, usufruct: 0.9 },
        { maxAgeExclusive: 31, usufruct: 0.8 },
        { maxAgeExclusive: 41, usufruct: 0.7 },
        { maxAgeExclusive: 51, usufruct: 0.6 },
        { maxAgeExclusive: 61, usufruct: 0.5 },
        { maxAgeExclusive: 71, usufruct: 0.4 },
        { maxAgeExclusive: 81, usufruct: 0.3 },
        { maxAgeExclusive: 91, usufruct: 0.2 },
        { maxAgeExclusive: 999, usufruct: 0.1 },
      ],
      temporaryPer10Years: 0.23,
    },
  },
];

/* ===================== Sélection de version ===================== */
export function pickVersion<T>(versions: Versioned<T>[], atDateISO?: string, id?: string): Versioned<T> {
  if (id) {
    const v = versions.find((x) => x.meta.id === id);
    if (v) return v;
  }
  const at = atDateISO ?? new Date().toISOString().slice(0, 10);
  const sorted = [...versions].sort((a, b) => a.meta.effectiveFrom.localeCompare(b.meta.effectiveFrom));
  let chosen = sorted[0];
  for (const v of sorted) if (v.meta.effectiveFrom <= at) chosen = v;
  return chosen;
}

export const latest = <T>(versions: Versioned<T>[]) => pickVersion(versions, '9999-12-31');

export const ALL_RULES = [
  ...IR_VERSIONS, ...IFI_VERSIONS, ...CAPITAL_TAX_VERSIONS, ...PER_VERSIONS, ...DMTG_VERSIONS, ...DISMEMBERMENT_VERSIONS,
].map((v) => v.meta);

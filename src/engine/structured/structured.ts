import { z } from 'zod';
import { ValidationError, validate } from '../core/errors';
import { addMonths, isValidISO, parseISO, toISO } from '../core/dates';
import { solveRoot } from '../core/solver';

/**
 * PRODUITS STRUCTURÉS — moteur de payoff déterministe par scénario
 * -------------------------------------------------------------------
 * Le moteur NE PRÉSUPPOSE AUCUN MÉCANISME : chaque clause est un paramètre explicite.
 * Niveaux exprimés en % du niveau initial du sous-jacent (100 = niveau initial).
 *
 * À chaque date d'observation k (k = 1..N) :
 *  - Coupon « périodique » (Phoenix) : versé si niveau ≥ barrière de coupon ;
 *    avec effet mémoire, les coupons non versés précédemment sont rattrapés.
 *  - Coupon « au remboursement » (Autocall / Athéna) : coupon × nombre de périodes écoulées
 *    (effet mémoire / boule de neige) ou un seul coupon (sans mémoire), versé uniquement au rappel
 *    ou à l'échéance si niveau final ≥ barrière de coupon.
 *  - Remboursement anticipé : si k ≥ 1re date de rappel et niveau ≥ barrière de rappel_k
 *    (barrière éventuellement dégressive : barrière − k_rappel × pas).
 *  - Fixe (Reverse convertible) : coupon garanti à chaque période, aucun rappel.
 *  - Capital protégé : coupon fixe éventuel ; à l'échéance capital × max(protection, min(1 + participation × (S_N − 1), plafond)).
 * À l'échéance (si pas de rappel) :
 *  - niveau ≥ barrière de protection (européenne) ou barrière jamais franchie (américaine,
 *    approximée par les niveaux du scénario aux dates d'observation) → 100 % du capital ;
 *  - sinon → capital × niveau final / strike.
 * Risque de crédit de l'émetteur, frais, fiscalité et valeur de marché en cours de vie : non modélisés.
 */
export const structuredSchema = z.object({
  productType: z.enum(['autocall', 'phoenix', 'reverse-convertible', 'capital-protected']),
  capital: z.number().positive('Capital investi requis'),
  issueDate: z.string().refine(isValidISO, 'Date d’émission invalide'),
  underlying: z.string().max(60).default(''),
  initialLevel: z.number().positive().default(100),
  maturityYears: z.number().positive().max(20),
  observationsPerYear: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(12)]),
  /** Coupon annuel (taux), versé à raison de coupon/fréquence par période. */
  couponRate: z.number().min(0).max(1),
  couponBarrier: z.number().min(0).max(2),
  memory: z.boolean(),
  autocallBarrier: z.number().min(0).max(2),
  autocallStepDown: z.number().min(0).max(0.2).default(0),
  firstCallObservation: z.number().int().min(1).default(1),
  protectionBarrier: z.number().min(0).max(1.5),
  barrierType: z.enum(['european', 'american']).default('european'),
  strike: z.number().positive().max(2).default(1),
  /** Capital protégé : niveau de protection du capital à l'échéance (1 = 100 %). */
  protectionLevel: z.number().min(0).max(1.2).default(1),
  /** Capital protégé : taux de participation à la hausse du sous-jacent. */
  participation: z.number().min(0).max(5).default(1),
  /** Capital protégé : plafond de remboursement (0 = sans plafond), en % du capital. */
  cap: z.number().min(0).max(5).default(0),
});
export type StructuredInput = z.input<typeof structuredSchema>;
export type StructuredProduct = z.infer<typeof structuredSchema>;

export interface ObservationRow {
  index: number;
  date: string;
  level: number; // % du niveau initial
  autocallBarrier: number | null;
  coupon: number;
  autocalled: boolean;
  capitalRedeemed: number;
  cumulative: number;
  event: string;
}
export interface ScenarioResult {
  label: string;
  finalPerformance: number;
  rows: ObservationRow[];
  redeemedEarly: boolean;
  redemptionDate: string;
  durationYears: number;
  totalCoupons: number;
  capitalReturned: number;
  totalReceived: number;
  gain: number;
  annualizedReturn: number;
  capitalLoss: boolean;
}

export function observationDates(p: StructuredProduct) {
  const n = Math.round(p.maturityYears * p.observationsPerYear);
  const step = 12 / p.observationsPerYear;
  const issue = parseISO(p.issueDate);
  return Array.from({ length: n }, (_, k) => toISO(addMonths(issue, step * (k + 1))));
}

/** Évalue le payoff d'un produit pour une trajectoire de niveaux (en fraction du niveau initial, 1 = 100 %). */
export function runStructured(raw: StructuredInput, path: number[], label = 'Scénario'): ScenarioResult {
  const p = validate(structuredSchema, raw);
  const dates = observationDates(p);
  const N = dates.length;
  if (N < 1) throw new ValidationError(['Au moins une date d’observation est requise']);
  if (path.length !== N) throw new ValidationError([`La trajectoire doit contenir ${N} niveaux (un par date d’observation)`]);
  if (path.some((x) => !Number.isFinite(x) || x < 0)) throw new ValidationError(['Niveaux de sous-jacent invalides']);

  const cpn = (p.couponRate / p.observationsPerYear) * p.capital;
  const rows: ObservationRow[] = [];
  let missed = 0;
  let cumulative = 0;
  let totalCoupons = 0;
  let capitalReturned = 0;
  let redeemedAt = -1;
  let barrierBreached = false;

  for (let k = 0; k < N; k++) {
    const idx = k + 1;
    const level = path[k];
    if (level < p.protectionBarrier) barrierBreached = true;
    const isLast = idx === N;
    const callable = p.productType !== 'reverse-convertible' && p.productType !== 'capital-protected' && idx >= p.firstCallObservation;
    const callBarrier = callable ? Math.max(0, p.autocallBarrier - p.autocallStepDown * (idx - p.firstCallObservation)) : null;
    let coupon = 0;
    let event = '';
    let autocalled = false;
    let capital = 0;

    if (p.productType === 'reverse-convertible' || (p.productType === 'capital-protected' && cpn > 0)) {
      coupon = cpn;
      event = 'Coupon fixe';
    } else if (p.productType === 'phoenix') {
      if (level >= p.couponBarrier) {
        coupon = cpn + (p.memory ? missed * cpn : 0);
        event = missed > 0 && p.memory ? `Coupon + ${missed} coupon(s) mémorisé(s)` : 'Coupon versé';
        missed = 0;
      } else {
        missed++;
        event = 'Coupon non versé';
      }
    }

    if (callBarrier !== null && level >= callBarrier) {
      autocalled = true;
      capital = p.capital;
      if (p.productType === 'autocall') {
        coupon = p.memory ? cpn * idx : cpn;
        event = `Rappel anticipé — coupon${p.memory ? ` × ${idx}` : ''}`;
      } else {
        event = (event ? event + ' · ' : '') + 'Rappel anticipé';
      }
      if (isLast) event = event.replace('Rappel anticipé', 'Remboursement à l’échéance');
    } else if (isLast && p.productType === 'capital-protected') {
      const perf = 1 + p.participation * (level - 1);
      const capped = p.cap > 0 ? Math.min(perf, p.cap) : perf;
      const redemption = Math.max(p.protectionLevel, capped);
      capital = p.capital * redemption;
      const label = redemption > p.protectionLevel + 1e-12 ? `Participation : remboursement à ${Math.round(redemption * 1000) / 10} %` : `Protection : remboursement à ${Math.round(p.protectionLevel * 1000) / 10} %`;
      event = (event ? event + ' · ' : '') + label;
    } else if (isLast) {
      if (p.productType === 'autocall' && level >= p.couponBarrier) {
        coupon = p.memory ? cpn * idx : cpn;
        event = `Coupon final${p.memory ? ` × ${idx}` : ''}`;
      }
      const protectedCapital = p.barrierType === 'european' ? level >= p.protectionBarrier : !barrierBreached || level >= p.strike;
      if (protectedCapital) {
        capital = p.capital;
        event = (event ? event + ' · ' : '') + 'Capital remboursé à 100 %';
      } else {
        capital = (p.capital * level) / p.strike;
        event = (event ? event + ' · ' : '') + `Perte en capital (${Math.round((level / p.strike - 1) * 1000) / 10} %)`;
      }
    }

    totalCoupons += coupon;
    capitalReturned += capital;
    cumulative += coupon + capital;
    rows.push({ index: idx, date: dates[k], level, autocallBarrier: callBarrier, coupon, autocalled, capitalRedeemed: capital, cumulative, event });
    if (autocalled) { redeemedAt = k; break; }
  }
  if (redeemedAt < 0) redeemedAt = N - 1;

  const durationYears = (redeemedAt + 1) / p.observationsPerYear;
  const totalReceived = totalCoupons + capitalReturned;
  // TRI annualisé (flux en fraction d'années)
  const flows = rows.map((r) => ({ t: r.index / p.observationsPerYear, a: r.coupon + r.capitalRedeemed }));
  let irr = NaN;
  if (totalReceived > 0) {
    try {
      irr = solveRoot((x) => flows.reduce((acc, f) => acc + f.a / Math.pow(1 + x, f.t), 0) - p.capital, { guess: 0.05, lo: -0.9999, hi: 10 }).root;
    } catch { irr = NaN; }
  } else irr = -1;

  return {
    label,
    finalPerformance: path[redeemedAt] - 1,
    rows,
    redeemedEarly: redeemedAt < N - 1,
    redemptionDate: dates[redeemedAt],
    durationYears,
    totalCoupons,
    capitalReturned,
    totalReceived,
    gain: totalReceived - p.capital,
    annualizedReturn: irr,
    capitalLoss: capitalReturned < p.capital - 1e-9,
  };
}

export const STANDARD_SCENARIOS: { label: string; perf: number }[] = [
  { label: 'Hausse de 20 %', perf: 0.2 },
  { label: 'Hausse de 10 %', perf: 0.1 },
  { label: 'Marché stable', perf: 0 },
  { label: 'Baisse de 10 %', perf: -0.1 },
  { label: 'Baisse de 20 %', perf: -0.2 },
  { label: 'Baisse de 30 %', perf: -0.3 },
  { label: 'Baisse de 40 %', perf: -0.4 },
  { label: 'Baisse de 50 %', perf: -0.5 },
];

export type PathShape = 'linear' | 'immediate';

/**
 * Trajectoire déterministe :
 *  - 'linear' : le sous-jacent évolue linéairement de 100 % à (100 % + perf) à l'échéance ;
 *  - 'immediate' : choc dès la 1re observation, niveau constant ensuite.
 */
export function buildPath(perf: number, n: number, shape: PathShape): number[] {
  return Array.from({ length: n }, (_, k) => (shape === 'immediate' ? 1 + perf : 1 + (perf * (k + 1)) / n));
}

/** Générateur pseudo-aléatoire déterministe (mulberry32) : même graine → même trajectoire. */
export function seededRandom(seed: number) {
  let a = (Math.floor(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Trajectoire volatile calée sur une performance cible à l'échéance :
 * marche aléatoire log-normale de volatilité annuelle σ (pas Δt = 1 / fréquence),
 * transformée en pont brownien pour que le niveau final soit exactement 1 + cible :
 *   X_k = Σ σ√Δt·ε_i ;  L_k = X_k − (k/N)·X_N + (k/N)·ln(1 + cible) ;  S_k = exp(L_k).
 */
export function buildVolatilePath(target: number, volatility: number, n: number, observationsPerYear: number, seed = 1): number[] {
  if (!(target > -1)) throw new ValidationError(['La performance cible doit être supérieure à −100 %']);
  if (volatility < 0 || volatility > 2) throw new ValidationError(['Volatilité comprise entre 0 % et 200 %']);
  const rnd = seededRandom(seed);
  const gauss = () => {
    const u = Math.max(rnd(), 1e-12);
    const v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const sd = volatility * Math.sqrt(1 / observationsPerYear);
  const x: number[] = [];
  let acc = 0;
  for (let k = 0; k < n; k++) { acc += sd * gauss(); x.push(acc); }
  const xN = x[n - 1] ?? 0;
  const lnT = Math.log(1 + target);
  return x.map((xk, k) => {
    const w = (k + 1) / n;
    return Math.round(Math.exp(xk - w * xN + w * lnT) * 10000) / 10000;
  });
}

/**
 * Fiscalité d'un scénario de produit structuré :
 *  - imposition « au fil de l'eau » : chaque coupon est taxé à son versement, la plus-value
 *    éventuelle au remboursement ; moins-value non imputée (imputable sur d'autres plus-values) ;
 *  - imposition « à la sortie » (enveloppe PEA) : gain global taxé au remboursement.
 */
export function taxStructuredScenario(s: ScenarioResult, capital: number, observationsPerYear: number, rate: number, exitOnly: boolean) {
  const flows: { t: number; a: number }[] = [];
  let tax = 0;
  for (const r of s.rows) {
    const t = r.index / observationsPerYear;
    let tx = 0;
    if (!exitOnly) {
      tx = r.coupon * rate + Math.max(0, r.capitalRedeemed - capital) * rate;
    } else if (r === s.rows[s.rows.length - 1]) {
      tx = Math.max(0, s.totalReceived - capital) * rate;
    }
    tax += tx;
    flows.push({ t, a: r.coupon + r.capitalRedeemed - tx });
  }
  const netReceived = s.totalReceived - tax;
  let netIRR = -1;
  if (netReceived > 0) {
    try { netIRR = solveRoot((x) => flows.reduce((acc, f) => acc + f.a / Math.pow(1 + x, f.t), 0) - capital, { guess: 0.04, lo: -0.9999, hi: 10 }).root; } catch { netIRR = NaN; }
  }
  return { tax, netReceived, netGain: netReceived - capital, netIRR };
}

export function calculateAutocall(raw: StructuredInput, shape: PathShape = 'linear', scenarios = STANDARD_SCENARIOS) {
  const p = validate(structuredSchema, raw);
  const n = observationDates(p).length;
  return scenarios.map((s) => runStructured(p, buildPath(s.perf, n, shape), s.label));
}

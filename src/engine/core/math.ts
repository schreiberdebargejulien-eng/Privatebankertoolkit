/**
 * Utilitaires numériques.
 * Convention : tous les taux sont exprimés en décimal (0.05 = 5 %).
 * Les calculs internes sont faits en pleine précision (double IEEE-754) ;
 * l'arrondi n'intervient qu'à la présentation ou lorsque la règle (fiscale) l'impose.
 */

/** Arrondi commercial (half away from zero) à n décimales, robuste aux erreurs binaires (1.005 → 1.01). */
export function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** decimals;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * f * (1 + Number.EPSILON))) / f;
}

/** Arrondi à l'euro le plus proche (règle fiscale CGI art. 1657 : fractions < 0,50 négligées, ≥ 0,50 comptées pour 1). */
export const roundEuro = (v: number) => round(v, 0);

/** Division protégée : renvoie `fallback` si le dénominateur est nul ou non fini. */
export function safeDiv(num: number, den: number, fallback = 0): number {
  if (den === 0 || !Number.isFinite(den) || !Number.isFinite(num)) return fallback;
  return num / den;
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Taux périodique équivalent (actuariel) à un taux annuel : (1+r)^(1/m) − 1. */
export function annualToPeriodicEquivalent(annual: number, periodsPerYear: number): number {
  return Math.pow(1 + annual, 1 / periodsPerYear) - 1;
}

/** Taux périodique proportionnel à un taux annuel nominal : r / m (convention des crédits en France). */
export function annualToPeriodicProportional(annualNominal: number, periodsPerYear: number): number {
  return annualNominal / periodsPerYear;
}

/** Taux annuel effectif d'un taux nominal capitalisé m fois par an. */
export function nominalToEffective(nominal: number, m: number): number {
  return Math.pow(1 + nominal / m, m) - 1;
}

/** Facteur d'annuité : PMT pour un capital de 1, taux périodique r, n périodes. */
export function annuityFactor(r: number, n: number): number {
  if (n <= 0) return NaN;
  if (Math.abs(r) < 1e-12) return 1 / n;
  return r / (1 - Math.pow(1 + r, -n));
}

/** Valeur future d'une suite de versements constants en fin de période. */
export function fvAnnuity(pmt: number, r: number, n: number): number {
  if (Math.abs(r) < 1e-12) return pmt * n;
  return pmt * ((Math.pow(1 + r, n) - 1) / r);
}

/** Barème progressif par tranches : renvoie l'impôt et le détail par tranche. */
export interface Bracket {
  /** Borne basse incluse de la tranche. */
  from: number;
  /** Borne haute (null = illimitée). */
  to: number | null;
  rate: number;
}
export interface BracketLine extends Bracket {
  base: number;
  tax: number;
}
export function applyBrackets(amount: number, brackets: Bracket[]): { tax: number; lines: BracketLine[]; marginalRate: number } {
  let tax = 0;
  let marginalRate = 0;
  const lines: BracketLine[] = [];
  for (const b of brackets) {
    const top = b.to ?? Infinity;
    const base = Math.max(0, Math.min(amount, top) - b.from);
    const t = base * b.rate;
    if (base > 0) marginalRate = b.rate;
    tax += t;
    lines.push({ ...b, base, tax: t });
  }
  return { tax, lines, marginalRate };
}

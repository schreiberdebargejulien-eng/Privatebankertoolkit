/**
 * Dates : manipulation en UTC pour éviter les effets de fuseau/heure d'été.
 * Les dates sont échangées au format ISO « AAAA-MM-JJ ».
 */
const MS_DAY = 86_400_000;

export function parseISO(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Date invalide : ${iso}`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCMonth() !== +m[2] - 1) throw new Error(`Date invalide : ${iso}`);
  return d;
}
export function isValidISO(iso: string): boolean {
  try { parseISO(iso); return true; } catch { return false; }
}
export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_DAY);
}
/** Ajoute n mois (fin de mois conservée si le jour n'existe pas : 31/01 + 1 mois = 28/02). */
export function addMonths(d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target;
}
export function addYears(d: Date, n: number): Date {
  return addMonths(d, 12 * n);
}
/** Différence en années révolues (âge). */
export function fullYearsBetween(a: Date, b: Date): number {
  let y = b.getUTCFullYear() - a.getUTCFullYear();
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) y--;
  return y;
}
export function todayISO(): string {
  const d = new Date();
  return toISO(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}

export type DayCount = 'ACT/ACT' | 'ACT/365' | 'ACT/360' | '30/360';

/** Nombre de jours selon la convention 30/360 (US / NASD, comme Excel base 0). */
export function days30360(a: Date, b: Date): number {
  let d1 = a.getUTCDate();
  let d2 = b.getUTCDate();
  const m1 = a.getUTCMonth() + 1, m2 = b.getUTCMonth() + 1;
  const y1 = a.getUTCFullYear(), y2 = b.getUTCFullYear();
  const lastFeb = (d: Date) => d.getUTCMonth() === 1 && new Date(Date.UTC(d.getUTCFullYear(), 2, 0)).getUTCDate() === d.getUTCDate();
  if (lastFeb(a) && lastFeb(b)) d2 = 30;
  if (lastFeb(a)) d1 = 30;
  if (d2 === 31 && d1 >= 30) d2 = 30;
  if (d1 === 31) d1 = 30;
  return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
}

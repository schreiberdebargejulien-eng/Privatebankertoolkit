import type { Currency } from './settings';

/** Formatage français. Remarque : la devise n'est qu'un libellé d'affichage (aucune conversion). */
let currentCurrency: Currency = 'EUR';
let currentCents = false;
export function configureFormat(currency: Currency, showCents: boolean) {
  currentCurrency = currency;
  currentCents = showCents;
}
export const currencySymbol = () => ({ EUR: '€', CHF: 'CHF', USD: '$', GBP: '£' })[currentCurrency];

const cache = new Map<string, Intl.NumberFormat>();
function nf(opts: Intl.NumberFormatOptions) {
  const k = JSON.stringify(opts);
  let f = cache.get(k);
  if (!f) { f = new Intl.NumberFormat('fr-FR', opts); cache.set(k, f); }
  return f;
}

export function money(v: number | null | undefined, opts: { cents?: boolean; sign?: boolean } = {}) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const cents = opts.cents ?? currentCents;
  const s = nf({ style: 'currency', currency: currentCurrency, minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0, signDisplay: opts.sign ? 'exceptZero' : 'auto' }).format(v);
  return s;
}
export function moneyCents(v: number) { return money(v, { cents: true }); }

export function pct(v: number | null | undefined, digits = 2, sign = false) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return nf({ style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: sign ? 'exceptZero' : 'auto' }).format(v);
}
export function num(v: number | null | undefined, digits = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return nf({ minimumFractionDigits: 0, maximumFractionDigits: digits }).format(v);
}
export function years(v: number) {
  if (!Number.isFinite(v)) return '—';
  const y = Math.floor(v + 1e-9);
  const m = Math.round((v - y) * 12);
  if (m === 12) return `${y + 1} ans`;
  if (y === 0) return `${m} mois`;
  return m ? `${y} an${y > 1 ? 's' : ''} ${m} mois` : `${y} an${y > 1 ? 's' : ''}`;
}
export function dateFR(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
/** Abréviation pour axes de graphiques : 1,2 M€, 350 k€ */
export function compact(v: number) {
  const a = Math.abs(v);
  const sym = currencySymbol();
  if (a >= 1e6) return `${num(v / 1e6, 1)} M${sym}`;
  if (a >= 1e3) return `${num(v / 1e3, 0)} k${sym}`;
  return `${num(v, 0)} ${sym}`;
}

/** Normalisation pour la recherche (accents, casse). */
export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Partage d'une simulation : les valeurs saisies sont encodées dans l'URL (fragment #),
 * qui n'est jamais transmis au serveur par le navigateur. Aucune donnée nominative
 * n'est saisie dans les simulateurs ; les champs texte libres sont exclus du partage.
 */
import type { Values } from '@/simulators/types';

export function encodeValues(v: Values): string {
  const json = JSON.stringify(v);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeValues(s: string): Values | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch { return null; }
}
export function shareUrl(simId: string, v: Values) {
  const base = window.location.href.split('#')[0];
  return `${base}#/sim/${simId}?s=${encodeValues(v)}`;
}

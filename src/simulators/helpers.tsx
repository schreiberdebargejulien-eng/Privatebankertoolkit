import { getMeta } from './catalog';
import type { SimulatorDef } from './types';
import { CAPITAL_TAX_VERSIONS, pickVersion } from '@/engine';

type DefBody = Omit<SimulatorDef, 'id' | 'title' | 'short' | 'categories' | 'sections' | 'keywords' | 'icon'>;
export function defineSim(id: string, body: DefBody): SimulatorDef {
  const m = getMeta(id);
  if (!m) throw new Error(`Simulateur inconnu : ${id}`);
  return { ...m, ...body };
}

export const TAX_MODE_OPTIONS = [
  { value: 'none', label: 'Aucune' },
  { value: 'exit', label: 'À la sortie' },
  { value: 'annual', label: 'Annuelle' },
];

/** Taux global du PFU en vigueur (IR 12,8 % + PS générales). */
export const currentPFU = () => {
  const p = pickVersion(CAPITAL_TAX_VERSIONS).params;
  return p.pfuIncomeTax + p.socialGeneral;
};
export const currentCapitalRuleId = () => pickVersion(CAPITAL_TAX_VERSIONS).meta.id;

export const taxModeLabel = (m: string) => (m === 'exit' ? 'taxation unique de la plus-value au terme' : m === 'annual' ? 'taxation annuelle des gains de l’année' : 'aucune fiscalité');

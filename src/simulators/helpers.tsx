import { getMeta } from './catalog';
import type { FieldDef, SimulatorDef, Values } from './types';
import { CAPITAL_TAX_VERSIONS, pickVersion, resolveInvestmentTax, TAX_REGIMES, TAX_REGIME_LABELS, type TaxRegime } from '@/engine';

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

/* ===================== Option fiscalité des placements ===================== */
export interface TaxFieldOptions {
  /** Proposer le PEA (titres éligibles). */
  pea?: boolean;
  /** Proposer le choix du moment d'imposition (sortie / annuelle). */
  timing?: boolean;
  /** Proposer un taux personnalisé (champ `taxRate`). */
  custom?: boolean;
  /** Préfixe des clés (plusieurs blocs dans un même simulateur). */
  group?: string | false;
}

export function taxRegimeOptions(o: TaxFieldOptions = {}) {
  return TAX_REGIMES.filter((r) => (r !== 'pea' || o.pea) && (r !== 'custom' || o.custom !== false)).map((r) => ({ value: r, label: TAX_REGIME_LABELS[r] }));
}
export const TMI_OPTIONS = [0, 0.11, 0.3, 0.41, 0.45].map((t) => ({ value: t, label: `${Math.round(t * 100)} %` }));
export const IS_RATE_OPTIONS = [{ value: 'normal', label: 'Taux normal 25 %' }, { value: 'reduced', label: 'Taux réduit PME 15 %' }];

/** Champs déclaratifs : régime fiscal (particulier PFU / barème / PEA, société IS, taux libre). */
export function taxFields(o: TaxFieldOptions = {}): FieldDef[] {
  const r = (v: Values) => v.taxRegime;
  return [
    ...(o.group === false ? [] : [{ kind: 'group', label: o.group ?? 'Fiscalité' } as FieldDef]),
    { kind: 'select', key: 'taxRegime', label: 'Régime fiscal de l’investisseur', options: taxRegimeOptions(o), hint: 'Particulier (PFU, barème, PEA) ou société soumise à l’IS.' },
    { kind: 'select', key: 'tmi', label: 'Tranche marginale d’imposition (TMI)', options: TMI_OPTIONS, visibleIf: (v) => r(v) === 'bareme' },
    { kind: 'segmented', key: 'isRate', label: 'Taux d’impôt sur les sociétés', options: IS_RATE_OPTIONS, visibleIf: (v) => r(v) === 'is', hint: 'Taux réduit : PME, bénéfice ≤ 42 500 €.' },
    ...(o.pea ? [{ kind: 'number', key: 'peaAge', label: 'Ancienneté du PEA à l’investissement', unit: 'ans', min: 0, visibleIf: (v: Values) => r(v) === 'pea', hint: 'Exonération d’IR des gains retirés après 5 ans de plan (PS dus).' } as FieldDef] : []),
    ...(o.custom !== false ? [{ kind: 'percent', key: 'taxRate', label: 'Taux d’imposition global', visibleIf: (v: Values) => r(v) === 'custom' } as FieldDef] : []),
    ...(o.timing ? [{ kind: 'segmented', key: 'taxMode', label: 'Imposition des gains', options: TAX_MODE_OPTIONS.filter((x) => x.value !== 'none'), visibleIf: (v: Values) => r(v) !== 'none' && r(v) !== 'pea', hint: 'Annuelle : produits distribués ou courus (IS : écarts de valeur liquidative, art. 209-0 A CGI).' } as FieldDef] : []),
  ];
}

export const taxDefaults = (regime: TaxRegime = 'pfu', extra: Values = {}): Values => ({ taxRegime: regime, tmi: 0.3, isRate: 'normal', peaAge: 0, taxRate: currentPFU(), taxMode: regime === 'is' ? 'annual' : 'exit', ...extra });

/** Résout le taux, le mode d'imposition et les barèmes d'un bloc fiscal. */
export function resolveTax(v: Values, holdingYears: number) {
  const regime = (v.taxRegime ?? 'none') as TaxRegime;
  const t = resolveInvestmentTax({ regime, tmi: v.tmi ?? 0.3, isRate: v.isRate ?? 'normal', peaAgeYears: v.peaAge ?? 0, customRate: v.taxRate ?? 0, holdingYears });
  const mode: 'none' | 'exit' | 'annual' = regime === 'none' ? 'none' : t.exitOnly ? 'exit' : v.taxMode === 'annual' ? 'annual' : 'exit';
  const timing = mode === 'annual' ? 'imposition annuelle des gains' : mode === 'exit' ? 'imposition de la plus-value à la sortie' : 'sans imposition';
  return { ...t, mode, note: regime === 'none' ? 'Fiscalité non prise en compte.' : `${t.label} — ${t.detail}${mode !== 'none' ? ` Mode : ${timing}.` : ''}` };
}

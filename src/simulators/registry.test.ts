import { describe, expect, it } from 'vitest';
import { ALL_SIMULATORS, getSimulator } from './registry';
import { SIMULATORS } from './catalog';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { safeCalc } from '@/engine';

describe('Registre des simulateurs', () => {
  it('chaque entrée du catalogue a une fiche', () => {
    expect(ALL_SIMULATORS.map((s) => s.id).sort()).toEqual(SIMULATORS.map((s) => s.id).sort());
  });
  it.each(ALL_SIMULATORS.map((s) => [s.id, s] as const))('%s : calcul avec les valeurs par défaut, hypothèses et formule documentées', (_id, def) => {
    const r = safeCalc(() => def.compute(def.defaults(DEFAULT_SETTINGS), DEFAULT_SETTINGS));
    if (!r.ok) throw new Error(r.errors.join(' | '));
    expect(r.value.report.headline.value).not.toMatch(/NaN|undefined/);
    expect(r.value.report.assumptions.length).toBeGreaterThan(0);
    expect(def.formula.length).toBeGreaterThan(0);
    expect(def.example.length).toBeGreaterThan(10);
    for (const m of r.value.report.metrics) expect(m.value).not.toMatch(/NaN|undefined/);
  });
  it('tous les champs déclarés ont une valeur par défaut', () => {
    for (const def of ALL_SIMULATORS) {
      const d = def.defaults(DEFAULT_SETTINGS);
      for (const f of def.fields) if (f.kind !== 'group') expect(d, `${def.id}.${f.key}`).toHaveProperty(f.key);
    }
  });
  it.each(ALL_SIMULATORS.filter((s) => 'taxRegime' in s.defaults(DEFAULT_SETTINGS)).map((s) => [s.id, s] as const))('%s : calcul sous chaque régime fiscal', (_id, def) => {
    const regimes = ['none', 'pfu', 'bareme', 'pea', 'is', 'custom'];
    for (const taxRegime of regimes) {
      const opts = def.fields.find((f) => f.kind === 'select' && f.key === 'taxRegime') as { options: { value: string }[] } | undefined;
      if (opts && !opts.options.some((o) => o.value === taxRegime)) continue;
      const r = safeCalc(() => def.compute({ ...def.defaults(DEFAULT_SETTINGS), taxRegime, isRate: 'reduced' }, DEFAULT_SETTINGS));
      if (!r.ok) throw new Error(`${taxRegime} : ${r.errors.join(' | ')}`);
      for (const m of r.value.report.metrics) expect(m.value, `${taxRegime} ${m.label}`).not.toMatch(/NaN|undefined/);
    }
  });
  it('anciens identifiants redirigés vers le simulateur unique', () => {
    expect(getSimulator('phoenix')?.id).toBe('structured');
    expect(getSimulator('autocall')?.id).toBe('structured');
  });
});

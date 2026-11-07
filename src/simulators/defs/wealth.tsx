import { Plus, Trash2 } from 'lucide-react';
import { calculatePatrimonialProjection, calculateAllocation, calculateWithdrawalPlan, calculateComplementaryIncome, compareCapitalisationDistribution, ValidationError } from '@/engine';
import { defineSim, currentPFU, taxFields, taxDefaults, resolveTax, taxRegimeOptions } from '../helpers';
import type { FieldDef } from '../types';
import { money, pct, years as fmtYears } from '@/lib/format';
import { DonutChart, LineSeriesChart } from '@/components/charts';
import { Button, FormCard, LineItem } from '@/components/ui/primitives';
import { NumberInput, TextInput } from '@/components/ui/fields';

export const projection = defineSim('projection', {
  description: 'Projection du patrimoine net (financier, immobilier, dettes) en euros courants et constants, à 10, 20 et 30 ans.',
  defaults: (s) => ({ financialAssets: 3_000_000, realEstate: 2_500_000, debt: 600_000, debtRate: 0.032, debtYears: 12, annualSavings: 120_000, indexSavings: true, financialReturn: 0.045, realEstateGrowth: 0.02, inflation: s.inflation, years: 30 }),
  fields: [
    { kind: 'group', label: 'Patrimoine actuel' },
    { kind: 'money', key: 'financialAssets', label: 'Patrimoine financier' },
    { kind: 'money', key: 'realEstate', label: 'Patrimoine immobilier' },
    { kind: 'money', key: 'debt', label: 'Dettes (capital restant dû)' },
    { kind: 'percent', key: 'debtRate', label: 'Taux moyen des dettes', visibleIf: (v) => v.debt > 0 },
    { kind: 'number', key: 'debtYears', label: 'Durée résiduelle des dettes', unit: 'ans', integer: true, visibleIf: (v) => v.debt > 0 },
    { kind: 'group', label: 'Hypothèses' },
    { kind: 'money', key: 'annualSavings', label: 'Épargne annuelle investie' },
    { kind: 'toggle', key: 'indexSavings', label: 'Indexer l’épargne sur l’inflation' },
    { kind: 'percent', key: 'financialReturn', label: 'Rendement financier net annuel', slider: { min: 0, max: 10, step: 0.1 } },
    { kind: 'percent', key: 'realEstateGrowth', label: 'Revalorisation immobilière annuelle' },
    { kind: 'percent', key: 'inflation', label: 'Inflation' },
    { kind: 'number', key: 'years', label: 'Horizon', unit: 'ans', integer: true, slider: { min: 5, max: 40, step: 1 } },
  ],
  compute: (v) => {
    const r = calculatePatrimonialProjection(v as never);
    return {
      report: {
        headline: { label: `Patrimoine net dans ${v.years} ans`, value: money(r.finalNet), sub: `soit ${money(r.finalReal)} en euros d’aujourd’hui (inflation ${pct(v.inflation, 1)})` },
        metrics: [
          { label: 'Patrimoine net actuel', value: money(r.initialNet) },
          ...r.milestones.map((m) => ({ label: `À ${m.year} ans`, value: money(m.net), hint: `réel ${money(m.real)} · financier ${money(m.financial)} · immobilier ${money(m.realEstate)}` })),
          ...(r.debtAnnuity > 0 ? [{ label: 'Annuité de remboursement des dettes', value: money(r.debtAnnuity) }] : []),
        ],
        tables: [{ title: 'Projection annuelle', columns: ['Année', 'Financier', 'Immobilier', 'Dettes', 'Net', 'Net réel'], rows: r.rows.map((x) => [x.year, money(x.financial), money(x.realEstate), money(x.debt), money(x.net), money(x.real)]) }],
        assumptions: ['Rendements constants, nets de frais et de fiscalité.', 'Épargne investie en fin d’année.', 'Dettes amorties par annuités constantes ; remboursements non déduits de l’épargne saisie.', 'Valeur réelle = valeur nominale / (1 + inflation)^t.'],
        warnings: [],
      },
      chart: <LineSeriesChart title="Composition du patrimoine" area stacked x="year" data={r.rows.map((x) => ({ year: x.year, financial: x.financial, realEstate: x.realEstate }))} series={[{ key: 'financial', label: 'Financier' }, { key: 'realEstate', label: 'Immobilier' }]} />,
    };
  },
  formula: ['F_{t+1} = F_t × (1 + r_f) + E_t', 'I_{t+1} = I_t × (1 + r_i)', 'Net réel_t = (F_t + I_t − D_t) / (1 + π)^t'],
  example: '100 000 € à 5 % sans épargne : 162 889 € dans 10 ans, 133 626 € en euros constants (inflation 2 %).',
});

type ALine = { label: string; amount: number | null; target: number | null; expectedReturn: number | null };
export const allocation = defineSim('allocation', {
  description: 'Poids et montants par classe d’actifs, écarts à une allocation cible et rendement espéré pondéré.',
  defaults: () => ({
    lines: [
      { label: 'Actions', amount: 4_000_000, target: 0.4, expectedReturn: 0.07 },
      { label: 'Obligations', amount: 2_500_000, target: 0.25, expectedReturn: 0.035 },
      { label: 'Monétaire', amount: 800_000, target: 0.05, expectedReturn: 0.02 },
      { label: 'Immobilier', amount: 1_200_000, target: 0.1, expectedReturn: 0.045 },
      { label: 'Private Equity', amount: 700_000, target: 0.1, expectedReturn: 0.1 },
      { label: 'Produits structurés', amount: 600_000, target: 0.07, expectedReturn: 0.06 },
      { label: 'Autres actifs', amount: 200_000, target: 0.03, expectedReturn: 0.03 },
    ],
  }),
  fields: [],
  customFormPosition: 'start',
  customForm: ({ values, set }) => {
    const lines: ALine[] = values.lines;
    const upd = (k: number, p: Partial<ALine>) => set({ lines: lines.map((l, i) => (i === k ? { ...l, ...p } : l)) });
    return (
      <FormCard title="Classes d’actifs">
        <div className="space-y-3">
          {lines.map((l, k) => (
            <LineItem
              key={k}
              index={k + 1}
              title={<TextInput value={l.label} maxLength={30} onChange={(label) => upd(k, { label })} />}
              action={<Button variant="ghost" size="icon" aria-label="Supprimer la classe" disabled={lines.length <= 1} onClick={() => set({ lines: lines.filter((_, i) => i !== k) })}><Trash2 className="h-4 w-4 text-muted" /></Button>}
            >
              <div className="grid grid-cols-2 sm:grid-cols-[1.6fr_1fr_1fr] gap-2 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1">
                <label className="block space-y-1.5 text-[12px] font-medium text-muted"><span>Montant</span><NumberInput value={l.amount} suffix="€" onChange={(amount) => upd(k, { amount })} /></label>
                <label className="block space-y-1.5 text-[12px] font-medium text-muted"><span>Cible</span><NumberInput value={l.target} scale={100} suffix="%" onChange={(target) => upd(k, { target })} /></label>
                <label className="block space-y-1.5 text-[12px] font-medium text-muted"><span>Rdt espéré</span><NumberInput value={l.expectedReturn} scale={100} suffix="%" onChange={(expectedReturn) => upd(k, { expectedReturn })} /></label>
              </div>
            </LineItem>
          ))}
        </div>
        {lines.length < 7 && <Button variant="subtle" className="mt-4 w-full" onClick={() => set({ lines: [...lines, { label: 'Nouvelle classe', amount: 0, target: 0, expectedReturn: 0 }] })}><Plus className="h-4 w-4" /> Ajouter une classe</Button>}
      </FormCard>
    );
  },
  compute: (v) => {
    const lines = (v.lines as ALine[]).map((l) => ({ label: l.label, amount: l.amount ?? NaN, target: l.target ?? undefined, expectedReturn: l.expectedReturn ?? undefined }));
    if (lines.some((l) => Number.isNaN(l.amount))) throw new ValidationError(['Renseignez le montant de chaque classe']);
    const r = calculateAllocation({ lines });
    if (r.total <= 0) throw new ValidationError(['Le total de l’allocation doit être positif']);
    return {
      report: {
        headline: { label: 'Patrimoine alloué', value: money(r.total), sub: r.expectedReturn !== undefined ? `Rendement espéré pondéré : ${pct(r.expectedReturn)}` : undefined },
        metrics: r.lines.map((l) => ({ label: l.label, value: pct(l.weight, 1), hint: `${money(l.amount)}${l.target !== undefined && r.hasTargets ? ` · cible ${pct(l.target, 1)}` : ''}` })),
        tables: [{ title: r.hasTargets ? 'Écarts à l’allocation cible' : 'Répartition', columns: r.hasTargets ? ['Classe', 'Montant', 'Poids', 'Cible', 'À arbitrer'] : ['Classe', 'Montant', 'Poids'], rows: r.lines.map((l) => r.hasTargets ? [l.label, money(l.amount), pct(l.weight, 1), pct(l.target ?? 0, 1), money(l.rebalance ?? 0, { sign: true })] : [l.label, money(l.amount), pct(l.weight, 1)]) }],
        assumptions: ['Rendement espéré = moyenne pondérée des rendements saisis (sans effet de corrélation ni de volatilité).', 'Montants à arbitrer = cible × total − montant actuel (positif : achat, négatif : vente).'],
        warnings: r.warnings,
      },
      chart: <DonutChart title="Répartition actuelle" data={r.lines.map((l) => ({ label: l.label, value: l.amount }))} />,
    };
  },
  formula: ['Poids_i = M_i / Σ M', 'Arbitrage_i = cible_i × Σ M − M_i', 'R_espéré = Σ poids_i × r_i'],
  example: '6 M€ d’actions sur 10 M€ : poids de 60 % ; avec une cible à 50 %, 1 M€ à arbitrer.',
});

export const withdrawal = defineSim('withdrawal', {
  description: 'Retraits mensuels programmés sur un capital : durée avant épuisement, capital résiduel et retrait soutenable.',
  defaults: (s) => ({ capital: 2_000_000, annualReturn: 0.04, monthlyWithdrawal: 10_000, inflation: s.inflation, indexWithdrawals: true, horizonYears: 25 }),
  fields: [
    { kind: 'money', key: 'capital', label: 'Capital initial' },
    { kind: 'percent', key: 'annualReturn', label: 'Rendement annuel net', slider: { min: 0, max: 8, step: 0.1 } },
    { kind: 'money', key: 'monthlyWithdrawal', label: 'Retrait mensuel' },
    { kind: 'toggle', key: 'indexWithdrawals', label: 'Indexer les retraits sur l’inflation' },
    { kind: 'percent', key: 'inflation', label: 'Inflation', visibleIf: (v) => v.indexWithdrawals },
    { kind: 'number', key: 'horizonYears', label: 'Horizon étudié', unit: 'ans', integer: true, slider: { min: 5, max: 50, step: 1 } },
  ],
  compute: (v) => {
    const r = calculateWithdrawalPlan(v as never);
    return {
      report: {
        headline: { label: 'Durée avant épuisement du capital', value: r.depletionYears === null ? 'Plus de 100 ans' : fmtYears(r.depletionYears), tone: r.depletedWithinHorizon ? 'neg' : 'pos', sub: r.depletedWithinHorizon ? `Capital épuisé avant l’horizon de ${v.horizonYears} ans` : `Capital résiduel à ${v.horizonYears} ans : ${money(r.finalCapital)}` },
        metrics: [
          { label: `Retrait soutenable sur ${v.horizonYears} ans`, value: `${money(r.sustainableMonthly)} / mois`, tone: 'accent', hint: v.indexWithdrawals ? 'montant initial, indexé ensuite' : 'montant constant' },
          { label: 'Retrait « perpétuel » approché', value: `${money(r.perpetualMonthlyApprox)} / mois`, hint: 'préserve le capital (réel si indexé)' },
          { label: 'Total retiré sur l’horizon', value: money(r.totalWithdrawn) },
          { label: `Capital à ${v.horizonYears} ans`, value: money(r.finalCapital) },
        ],
        tables: [{ title: 'Évolution annuelle', columns: ['Année', 'Retrait mensuel', 'Retiré dans l’année', 'Capital fin d’année'], rows: r.yearly.map((y) => [y.year, money(y.monthly), money(y.withdrawn), money(y.capital)]) }],
        assumptions: ['Retraits en début de mois, rendement mensuel équivalent (1 + r)^(1/12) − 1.', 'Indexation annuelle des retraits le cas échéant.', 'Rendement constant, net de frais et de fiscalité.'],
        warnings: ['Rendement constant : le risque de séquence (baisse de marché en début de retraits) n’est pas modélisé.'],
      },
      chart: <LineSeriesChart title="Capital restant" area x="year" data={[{ year: 0, capital: v.capital }, ...r.yearly.map((y) => ({ year: y.year, capital: y.capital }))]} series={[{ key: 'capital', label: 'Capital' }]} />,
    };
  },
  formula: ['C_{m+1} = (C_m − W_m) × (1 + r_m)', 'W indexé : W_{a+1} = W_a × (1 + π)', 'Retrait soutenable : W tel que C_horizon = 0'],
  example: '100 000 € à 0 % avec 1 000 € / mois : épuisement en 100 mois (8 ans 4 mois).',
});

export const income = defineSim('income', {
  description: 'Revenu complémentaire net tiré d’un capital investi (distribution, dividendes, SCPI…), et évolution du capital.',
  defaults: (s) => ({ capital: 1_500_000, totalReturn: 0.05, distributionRate: 0.04, years: 20, inflation: s.inflation, ...taxDefaults('pfu') }),
  fields: [
    { kind: 'money', key: 'capital', label: 'Capital investi' },
    { kind: 'percent', key: 'totalReturn', label: 'Rendement total annuel', hint: 'Revenus distribués + valorisation.' },
    { kind: 'percent', key: 'distributionRate', label: 'Taux de distribution annuel' },
    { kind: 'number', key: 'years', label: 'Horizon', unit: 'ans', integer: true },
    { kind: 'percent', key: 'inflation', label: 'Inflation' },
    ...taxFields({ group: 'Fiscalité des revenus distribués' }),
  ],
  compute: (v) => {
    const t = resolveTax(v, 0);
    const r = calculateComplementaryIncome({ ...v, taxRate: t.rate } as never);
    return {
      report: {
        headline: { label: 'Revenu net mensuel', value: money(r.netMonthly), tone: 'pos', sub: `${money(r.netAnnual)} nets par an · rendement net distribué ${pct(r.netYield)}` },
        metrics: [
          { label: 'Revenu brut annuel', value: money(r.grossAnnual) },
          { label: 'Fiscalité annuelle', value: money(r.grossAnnual - r.netAnnual), tone: 'neg', hint: v.taxRegime !== 'none' ? `${t.label} · ${pct(t.rate, 1)}` : undefined },
          { label: `Revenus nets cumulés sur ${v.years} ans`, value: money(r.totalNet) },
          { label: `Capital à ${v.years} ans`, value: money(r.finalCapital) },
          { label: `Revenu net de l’année ${v.years} (euros constants)`, value: money(r.rows[r.rows.length - 1].realNet) },
        ],
        tables: [{ title: 'Revenus et capital', columns: ['Année', 'Revenu brut', 'Revenu net', 'Net réel', 'Capital'], rows: r.rows.map((x) => [x.year, money(x.gross), money(x.net), money(x.realNet), money(x.capital)]) }],
        assumptions: ['Distribution = taux × capital en début d’année ; le capital progresse de (rendement total − distribution).', 'Fiscalité appliquée sur l’intégralité des revenus distribués.', `Fiscalité : ${t.note}`, ...(v.taxRegime === 'bareme' ? ['Option barème : abattement de 40 % sur dividendes d’actions non appliqué (revenus de SCPI : revenus fonciers, TMI + 17,2 %).'] : [])],
        warnings: r.warnings,
        rules: t.ruleIds,
      },
      chart: <LineSeriesChart title="Revenu net annuel" x="year" data={r.rows.map((x) => ({ year: x.year, net: x.net, real: x.realNet }))} series={[{ key: 'net', label: 'Nominal' }, { key: 'real', label: 'Euros constants' }]} />,
    };
  },
  formula: ['Revenu brut = C × d', 'Revenu net = brut × (1 − t)', 'C_{t+1} = C_t × (1 + r) − C_t × d'],
  example: '1 M€ distribuant 4 % taxés à 30 % : 28 000 € nets par an, soit 2 333 € par mois.',
});

export const capVsDist = defineSim('cap-vs-dist', {
  description: 'Comparaison d’une part capitalisante et d’une part distribuante : effet de la fiscalité annuelle sur l’intérêt composé.',
  defaults: () => ({ capital: 1_000_000, totalReturn: 0.06, distributionRate: 0.03, distributionTax: currentPFU(), exitTax: currentPFU(), reinvest: true, years: 15, ...taxDefaults('pfu') }),
  fields: [
    { kind: 'money', key: 'capital', label: 'Capital investi' },
    { kind: 'percent', key: 'totalReturn', label: 'Rendement total annuel' },
    { kind: 'percent', key: 'distributionRate', label: 'Taux de distribution (part D)' },
    { kind: 'toggle', key: 'reinvest', label: 'Réinvestir les distributions nettes' },
    { kind: 'number', key: 'years', label: 'Horizon', unit: 'ans', integer: true, slider: { min: 1, max: 30, step: 1 } },
    ...capDistTaxFields(),
    { kind: 'percent', key: 'distributionTax', label: 'Fiscalité des distributions', visibleIf: (v) => v.taxRegime === 'custom' },
    { kind: 'percent', key: 'exitTax', label: 'Fiscalité de la plus-value à la sortie', visibleIf: (v) => v.taxRegime === 'custom' },
  ],
  compute: (v) => {
    const t = resolveTax(v, v.years);
    const custom = v.taxRegime === 'custom';
    // PEA : distributions réinvesties dans le plan sans imposition ; gain global taxé au retrait.
    const distributionTax = custom ? v.distributionTax : t.exitOnly ? 0 : t.rate;
    const exitTax = custom ? v.exitTax : t.rate;
    const r = compareCapitalisationDistribution({ ...v, distributionTax, exitTax } as never);
    return {
      report: {
        headline: { label: 'Avantage de la capitalisation', value: money(r.difference, { sign: true }), tone: r.difference >= 0 ? 'pos' : 'neg', sub: `Capitalisation ${money(r.capitalisationNet)} vs distribution ${money(r.distributionNet)} nets après ${v.years} ans` },
        metrics: [
          { label: 'Part capitalisante — net après impôt', value: money(r.capitalisationNet) },
          { label: 'Part distribuante — net après impôt', value: money(r.distributionNet) },
          { label: 'Impôts payés sur distributions', value: money(r.distTaxPaid), tone: 'neg' },
          { label: 'Impôt de sortie — capitalisante', value: money(r.capExitTax), tone: 'neg' },
          { label: 'Impôt de sortie — distribuante', value: money(r.distExitTax), tone: 'neg' },
          ...(!v.reinvest ? [{ label: 'Distributions nettes conservées', value: money(r.cashAccumulated) }] : []),
        ],
        tables: [{ title: 'Valeur nette liquidative après impôt', columns: ['Année', 'Capitalisation', 'Distribution'], rows: r.rows.map((x) => [x.year, money(x.capitalisation), money(x.distribution)]) }],
        assumptions: ['Même rendement total pour les deux parts.', 'Distributions taxées chaque année ; réinvestissement du net (nouveau prix de revient).', 'Valeurs nettes = valeur − impôt latent de sortie sur la plus-value.', custom ? `Taux saisis : distributions ${pct(distributionTax, 1)}, plus-value ${pct(exitTax, 1)}.` : `Fiscalité : ${t.note}`, ...(v.taxRegime === 'pea' ? ['PEA : les distributions restent dans le plan sans imposition immédiate — les deux parts aboutissent au même résultat.'] : []), ...(v.taxRegime === 'is' ? ['IS : la part capitalisante d’OPC est en pratique imposée chaque exercice sur l’écart de valeur liquidative (art. 209-0 A CGI), ce qui neutralise une partie de l’avantage affiché.'] : [])],
        warnings: [],
        rules: custom ? [] : t.ruleIds,
      },
      chart: <LineSeriesChart title="Valeur nette après impôt" x="year" data={r.rows} series={[{ key: 'capitalisation', label: 'Capitalisation' }, { key: 'distribution', label: 'Distribution' }]} />,
    };
  },
  formula: ['Cap : C(1+r)ⁿ − t_s × PV', 'Dist : V_{t+1} = V_t(1 + r) − d·V_t + (1 − t_d)·d·V_t'],
  example: 'Sans fiscalité, les deux parts aboutissent au même capital ; la capitalisation l’emporte dès que les distributions sont taxées.',
});

function capDistTaxFields(): FieldDef[] {
  return taxFields({ pea: true, custom: false }).map((f) => (f.kind === 'select' && f.key === 'taxRegime' ? { ...f, options: taxRegimeOptions({ pea: true }) } : f));
}

export const wealthSims = [projection, allocation, withdrawal, income, capVsDist];

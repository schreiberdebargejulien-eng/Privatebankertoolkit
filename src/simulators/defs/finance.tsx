import { Plus, Trash2 } from 'lucide-react';
import { ValidationError, calculateCAGR, calculateCompoundInterest, calculateNetYield, calculatePresentValue, calculateXIRR, comparePlacements, todayISO, addMonths, parseISO, toISO } from '@/engine';
import { defineSim, TAX_MODE_OPTIONS, currentPFU, taxModeLabel, currentCapitalRuleId } from '../helpers';
import { money, pct, num, years as fmtYears, dateFR } from '@/lib/format';
import { BarSeriesChart, LineSeriesChart } from '@/components/charts';
import { Button, Card } from '@/components/ui/primitives';
import { DateInput, NumberInput, Select, TextInput } from '@/components/ui/fields';

const pfuNote = () => `Taux PFU de référence en vigueur : ${pct(currentPFU(), 1)} (IR 12,8 % + prélèvements sociaux).`;

export const compound = defineSim('compound', {
  description: 'Projection d’un capital avec versements périodiques, capitalisation des intérêts et fiscalité éventuelle.',
  defaults: (s) => ({ initial: 100_000, contribution: 500, contributionFrequency: 12, contributionTiming: s.contributionTiming, years: 15, nominalRate: 0.04, compounding: 1, taxMode: 'none', taxRate: currentPFU() }),
  fields: [
    { kind: 'group', label: 'Capital et versements' },
    { kind: 'money', key: 'initial', label: 'Capital initial' },
    { kind: 'money', key: 'contribution', label: 'Versement périodique' },
    { kind: 'segmented', key: 'contributionFrequency', label: 'Fréquence des versements', options: [{ value: 12, label: 'Mensuel' }, { value: 4, label: 'Trimestriel' }, { value: 1, label: 'Annuel' }] },
    { kind: 'segmented', key: 'contributionTiming', label: 'Date des versements', options: [{ value: 'start', label: 'Début de période' }, { value: 'end', label: 'Fin de période' }] },
    { kind: 'group', label: 'Rendement' },
    { kind: 'number', key: 'years', label: 'Durée', unit: 'ans', integer: true, slider: { min: 1, max: 40, step: 1 } },
    { kind: 'percent', key: 'nominalRate', label: 'Taux annuel nominal', slider: { min: 0, max: 12, step: 0.1 } },
    { kind: 'select', key: 'compounding', label: 'Capitalisation des intérêts', options: [{ value: 1, label: 'Annuelle' }, { value: 2, label: 'Semestrielle' }, { value: 4, label: 'Trimestrielle' }, { value: 12, label: 'Mensuelle' }, { value: 365, label: 'Quotidienne' }] },
    { kind: 'group', label: 'Fiscalité' },
    { kind: 'segmented', key: 'taxMode', label: 'Fiscalité des gains', options: TAX_MODE_OPTIONS },
    { kind: 'percent', key: 'taxRate', label: 'Taux d’imposition des gains', visibleIf: (v) => v.taxMode !== 'none', hint: pfuNote() },
  ],
  compute: (v) => {
    const r = calculateCompoundInterest(v as never);
    return {
      report: {
        headline: { label: 'Capital final net', value: money(r.finalValueNet), sub: `dont ${money(r.netGains)} de gains nets sur ${v.years} ans` },
        metrics: [
          { label: 'Versements cumulés', value: money(r.totalContributed) },
          { label: 'Intérêts générés (bruts)', value: money(r.interest), tone: 'pos' },
          { label: 'Fiscalité', value: money(r.totalTax), tone: r.totalTax > 0 ? 'neg' : 'muted' },
          { label: 'Performance cumulée nette', value: pct(r.performance, 1) },
          { label: 'Rendement annualisé net (TRI)', value: pct(r.netIRR) },
          { label: 'Taux annuel effectif', value: pct(r.effectiveRate, 3) },
          { label: 'Multiple', value: `× ${num(r.multiple, 2)}` },
        ],
        tables: [{ title: 'Évolution annuelle', columns: ['Année', 'Versements', 'Intérêts cumulés', 'Capital'], rows: r.schedule.map((y) => [y.year, money(y.contributed), money(y.gains), money(y.value)]) }],
        assumptions: [
          `Taux effectif annuel = (1 + ${pct(v.nominalRate)}/${v.compounding})^${v.compounding} − 1 = ${pct(r.effectiveRate, 3)}.`,
          'Versements capitalisés au taux équivalent par période de versement.',
          `Fiscalité : ${taxModeLabel(v.taxMode)}${v.taxMode !== 'none' ? ` au taux de ${pct(v.taxRate, 1)}` : ''}.`,
          'Rendement constant, hors frais et inflation.',
        ],
        warnings: [],
        rules: v.taxMode !== 'none' ? [currentCapitalRuleId()] : [],
      },
      chart: <LineSeriesChart title="Capital vs versements" area x="year" data={r.schedule.map((y) => ({ year: y.year, value: y.value, contributed: y.contributed }))} series={[{ key: 'value', label: 'Capital' }, { key: 'contributed', label: 'Versements cumulés' }]} />,
    };
  },
  formula: ['Cₙ = C₀ × (1 + i/m)^(m·n) + Σ V × (1 + r_p)^(périodes restantes)', 'r_p = (1 + r_eff)^(1/f) − 1, r_eff = (1 + i/m)^m − 1', 'Gains nets = (Cₙ − Σ versements) × (1 − t)'],
  example: '100 000 € à 5 % capitalisés annuellement pendant 10 ans donnent 162 889 €.',
});

/* ------------------------------ XIRR ------------------------------ */
export const xirr = defineSim('xirr', {
  description: 'Taux de rendement interne de flux datés (méthode TRI.PAIEMENTS / XIRR), adapté au private equity et aux investissements irréguliers.',
  defaults: () => {
    const t = parseISO(todayISO());
    const d = (m: number) => toISO(addMonths(t, m));
    return { flows: [{ date: d(-60), amount: -500_000 }, { date: d(-48), amount: -250_000 }, { date: d(-24), amount: 150_000 }, { date: d(-6), amount: 300_000 }, { date: d(0), amount: 650_000 }] };
  },
  fields: [],
  customFormPosition: 'start',
  customForm: ({ values, set }) => {
    const flows: { date: string; amount: number | null }[] = values.flows;
    const upd = (k: number, p: object) => set({ flows: flows.map((f, i) => (i === k ? { ...f, ...p } : f)) });
    return (
      <Card className="p-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-accent mb-1">Flux financiers</div>
        <p className="text-xs text-muted mb-3">Investissements en négatif, distributions / valorisation finale en positif.</p>
        <div className="space-y-2.5">
          {flows.map((f, k) => (
            <div key={k} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
              <DateInput value={f.date} onChange={(date) => upd(k, { date })} />
              <NumberInput value={f.amount} onChange={(amount) => upd(k, { amount })} suffix="€" />
              <Button variant="ghost" size="icon" aria-label="Supprimer le flux" onClick={() => set({ flows: flows.filter((_, i) => i !== k) })} disabled={flows.length <= 2}><Trash2 className="h-4 w-4 text-muted" /></Button>
            </div>
          ))}
        </div>
        <Button className="mt-3 w-full" onClick={() => set({ flows: [...flows, { date: todayISO(), amount: 0 }] })}><Plus className="h-4 w-4" /> Ajouter un flux</Button>
      </Card>
    );
  },
  compute: (v) => {
    if ((v.flows as { amount: number | null }[]).some((f) => f.amount === null)) throw new ValidationError(['Montant de flux manquant']);
    const r = calculateXIRR({ flows: v.flows });
    return {
      report: {
        headline: { label: 'TRI annualisé', value: pct(r.irr), tone: r.irr >= 0 ? 'pos' : 'neg', sub: `sur ${fmtYears(r.durationYears)} · multiple × ${num(r.multiple, 2)}` },
        metrics: [
          { label: 'Total investi', value: money(r.invested) },
          { label: 'Total perçu', value: money(r.returned) },
          { label: 'Gain net', value: money(r.netGain), tone: r.netGain >= 0 ? 'pos' : 'neg' },
          { label: 'Multiple (TVPI)', value: `× ${num(r.multiple, 2)}` },
          { label: 'Convergence', value: `${r.method === 'newton' ? 'Newton-Raphson' : 'Bissection'} · ${r.iterations} itérations` },
        ],
        tables: [{ title: 'Flux retenus', columns: ['Date', 'Années', 'Montant'], rows: r.flows.map((f) => [dateFR(f.date), num(f.t, 3), money(f.amount)]) }],
        assumptions: ['Base exact/365 depuis le premier flux (convention TRI.PAIEMENTS d’Excel).', `Résidu de VAN au taux trouvé : ${num(r.residual, 6)} €.`],
        warnings: r.multipleSignChanges ? ['Plusieurs changements de signe dans les flux : plusieurs TRI mathématiques peuvent exister. Le résultat est la racine trouvée la plus proche de 10 %.'] : [],
      },
      chart: <BarSeriesChart title="Flux par date" x="date" colorByValue data={r.flows.map((f) => ({ date: dateFR(f.date), amount: f.amount }))} series={[{ key: 'amount', label: 'Flux' }]} />,
    };
  },
  formula: ['Σ CFᵢ / (1 + TRI)^((dᵢ − d₀)/365) = 0', 'Résolution : Newton-Raphson, repli par bissection, contrôle du résidu'],
  example: '−10 000 € le 01/01/2008 puis 2 750, 4 250, 3 250 et 2 750 € → TRI de 37,34 % (référence Excel).',
});

/* ------------------------------ CAGR ------------------------------ */
export const cagr = defineSim('cagr', {
  description: 'Taux de croissance annuel composé entre une valeur initiale et une valeur finale.',
  defaults: () => ({ initialValue: 1_000_000, finalValue: 1_450_000, years: 6 }),
  fields: [
    { kind: 'money', key: 'initialValue', label: 'Valeur initiale' },
    { kind: 'money', key: 'finalValue', label: 'Valeur finale' },
    { kind: 'number', key: 'years', label: 'Durée', unit: 'ans', slider: { min: 1, max: 30, step: 0.5 } },
  ],
  compute: (v) => {
    const r = calculateCAGR(v as never);
    return {
      report: {
        headline: { label: 'Performance annualisée (CAGR)', value: pct(r.cagr), tone: r.cagr >= 0 ? 'pos' : 'neg' },
        metrics: [
          { label: 'Performance cumulée', value: pct(r.totalReturn, 1), tone: r.totalReturn >= 0 ? 'pos' : 'neg' },
          { label: 'Multiple', value: `× ${num(r.multiple, 3)}` },
          { label: 'Plus-value', value: money(v.finalValue - v.initialValue) },
        ],
        assumptions: ['Croissance géométrique lissée : ne reflète pas la volatilité du parcours.', 'Aucun flux intermédiaire (sinon utiliser le TRI).'],
        warnings: [],
      },
      chart: <LineSeriesChart title="Trajectoire lissée" x="year" data={r.path} series={[{ key: 'value', label: 'Valeur' }]} />,
    };
  },
  formula: ['CAGR = (V_f / V_i)^(1/n) − 1'],
  example: 'De 100 à 200 en 10 ans : CAGR = 7,18 %.',
});

/* --------------------------- Rendement net --------------------------- */
export const netYield = defineSim('net-yield', {
  description: 'Décomposition du rendement brut en rendement net de frais puis net de fiscalité.',
  defaults: () => ({ capital: 500_000, grossRate: 0.055, annualFee: 0.012, entryFee: 0.01, taxMode: 'exit', taxRate: currentPFU(), years: 8 }),
  fields: [
    { kind: 'money', key: 'capital', label: 'Capital investi' },
    { kind: 'percent', key: 'grossRate', label: 'Rendement brut annuel', slider: { min: 0, max: 12, step: 0.1 } },
    { kind: 'percent', key: 'annualFee', label: 'Frais annuels (gestion, UC…)', slider: { min: 0, max: 3, step: 0.05 } },
    { kind: 'percent', key: 'entryFee', label: 'Frais d’entrée' },
    { kind: 'number', key: 'years', label: 'Horizon', unit: 'ans', integer: true, slider: { min: 1, max: 30, step: 1 } },
    { kind: 'segmented', key: 'taxMode', label: 'Fiscalité des gains', options: TAX_MODE_OPTIONS },
    { kind: 'percent', key: 'taxRate', label: 'Taux d’imposition', visibleIf: (v) => v.taxMode !== 'none', hint: pfuNote() },
  ],
  compute: (v) => {
    const r = calculateNetYield(v as never);
    return {
      report: {
        headline: { label: 'Rendement net annualisé', value: pct(r.netAnnual), tone: r.netAnnual >= 0 ? 'pos' : 'neg', sub: `Capital net final : ${money(r.netFinal)}` },
        metrics: [
          { label: 'Rendement brut', value: pct(r.grossAnnual) },
          { label: 'Rendement net de frais', value: pct(r.afterFeesAnnual) },
          { label: 'Impact des frais', value: `− ${pct(r.feeDrag)} / an`, tone: 'neg' },
          { label: 'Impact de la fiscalité', value: `− ${pct(r.taxDrag)} / an`, tone: 'neg' },
          { label: 'Coût cumulé des frais', value: money(r.feesCost), tone: 'neg' },
          { label: 'Coût cumulé de la fiscalité', value: money(r.taxCost), tone: 'neg' },
          { label: 'Capital brut (sans frais ni impôt)', value: money(r.grossFinal) },
        ],
        assumptions: ['Frais de gestion prélevés sur l’encours : V × (1 + r) × (1 − f) chaque année.', 'Frais d’entrée déduits du capital investi.', `Fiscalité : ${taxModeLabel(v.taxMode)}.`, 'Rendement net = TRI entre le capital versé et la valeur nette finale.'],
        warnings: [],
        rules: v.taxMode !== 'none' ? [currentCapitalRuleId()] : [],
      },
      chart: <BarSeriesChart title="Du brut au net (capital final)" x="label" data={[{ label: 'Brut', v: r.grossFinal }, { label: 'Net de frais', v: r.afterFeesFinal }, { label: 'Net final', v: r.netFinal }]} series={[{ key: 'v', label: 'Capital' }]} />,
    };
  },
  formula: ['V_n = C × (1 − f_e) × [(1 + r)(1 − f)]ⁿ', 'Net = V_n − t × (V_n − C)', 'r_net = (Net / C)^(1/n) − 1'],
  example: '100 000 € à 4 % brut avec 1 % de frais pendant 10 ans : 133 871 €, soit 2,96 % net de frais par an.',
});

/* --------------------------- Actualisation --------------------------- */
export const discount = defineSim('discount', {
  description: 'Valeur actuelle d’un montant futur et pouvoir d’achat réel.',
  defaults: (s) => ({ futureValue: 1_000_000, rate: 0.04, years: 10, compounding: 1, inflation: s.inflation }),
  fields: [
    { kind: 'money', key: 'futureValue', label: 'Valeur future' },
    { kind: 'percent', key: 'rate', label: 'Taux d’actualisation annuel', slider: { min: 0, max: 12, step: 0.1 } },
    { kind: 'number', key: 'years', label: 'Durée', unit: 'ans', slider: { min: 1, max: 40, step: 1 } },
    { kind: 'select', key: 'compounding', label: 'Capitalisation', options: [{ value: 1, label: 'Annuelle' }, { value: 2, label: 'Semestrielle' }, { value: 4, label: 'Trimestrielle' }, { value: 12, label: 'Mensuelle' }] },
    { kind: 'percent', key: 'inflation', label: 'Inflation (valeur réelle)' },
  ],
  compute: (v) => {
    const r = calculatePresentValue(v as never);
    return {
      report: {
        headline: { label: 'Valeur actuelle', value: money(r.presentValue) },
        metrics: [
          { label: 'Facteur d’actualisation', value: num(r.discountFactor, 6) },
          { label: 'Décote d’actualisation', value: money(r.discount), tone: 'neg' },
          { label: 'Valeur réelle (pouvoir d’achat)', value: money(r.realValue), hint: `inflation ${pct(v.inflation, 1)} / an` },
        ],
        tables: [{ title: 'Valeur actuelle selon l’échéance', columns: ['Année', 'Facteur', 'Valeur actuelle'], rows: r.table.map((t) => [num(t.year, 2), num(t.discountFactor, 5), money(t.pv)]) }],
        assumptions: ['VA = VF / (1 + r/m)^(m·n).', 'Valeur réelle = VF / (1 + π)ⁿ.'],
        warnings: [],
      },
    };
  },
  formula: ['VA = VF × (1 + r/m)^(−m·n)'],
  example: '1 000 € dans 10 ans actualisés à 5 % valent 613,91 € aujourd’hui.',
});

/* --------------------------- Comparateur --------------------------- */
type Pl = { label: string; grossRate: number | null; annualFee: number | null; entryFee: number | null; taxMode: string; taxRate: number | null };
export const compare = defineSim('compare', {
  description: 'Comparez jusqu’à cinq placements sur un même horizon : rendement, frais et fiscalité.',
  defaults: () => ({
    initial: 500_000, monthlyContribution: 0, years: 10,
    placements: [
      { label: 'Fonds euros', grossRate: 0.03, annualFee: 0.006, entryFee: 0, taxMode: 'exit', taxRate: 0.247 },
      { label: 'Gestion pilotée UC', grossRate: 0.055, annualFee: 0.018, entryFee: 0.01, taxMode: 'exit', taxRate: 0.247 },
      { label: 'Compte-titres', grossRate: 0.055, annualFee: 0.008, entryFee: 0, taxMode: 'exit', taxRate: currentPFU() },
    ],
  }),
  fields: [
    { kind: 'money', key: 'initial', label: 'Capital initial' },
    { kind: 'money', key: 'monthlyContribution', label: 'Versement mensuel' },
    { kind: 'number', key: 'years', label: 'Horizon', unit: 'ans', integer: true, slider: { min: 1, max: 30, step: 1 } },
  ],
  customForm: ({ values, set }) => {
    const pls: Pl[] = values.placements;
    const upd = (k: number, p: Partial<Pl>) => set({ placements: pls.map((x, i) => (i === k ? { ...x, ...p } : x)) });
    return (
      <div className="space-y-3">
        {pls.map((pl, k) => (
          <Card key={k} className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-accent/15 text-accent text-xs font-semibold flex items-center justify-center">{k + 1}</span>
              <div className="flex-1"><TextInput value={pl.label} onChange={(label) => upd(k, { label })} maxLength={30} /></div>
              <Button variant="ghost" size="icon" aria-label="Supprimer" disabled={pls.length <= 2} onClick={() => set({ placements: pls.filter((_, i) => i !== k) })}><Trash2 className="h-4 w-4 text-muted" /></Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[11px] text-muted space-y-1"><span>Rendement brut</span><NumberInput value={pl.grossRate} scale={100} suffix="%" onChange={(grossRate) => upd(k, { grossRate })} /></label>
              <label className="text-[11px] text-muted space-y-1"><span>Frais annuels</span><NumberInput value={pl.annualFee} scale={100} suffix="%" onChange={(annualFee) => upd(k, { annualFee })} /></label>
              <label className="text-[11px] text-muted space-y-1"><span>Frais d’entrée</span><NumberInput value={pl.entryFee} scale={100} suffix="%" onChange={(entryFee) => upd(k, { entryFee })} /></label>
            </div>
            <div className="grid grid-cols-[1fr_7rem] gap-2 items-end">
              <label className="text-[11px] text-muted space-y-1"><span>Fiscalité</span><Select value={pl.taxMode} onChange={(taxMode) => upd(k, { taxMode })} options={TAX_MODE_OPTIONS} /></label>
              {pl.taxMode !== 'none' && <label className="text-[11px] text-muted space-y-1"><span>Taux</span><NumberInput value={pl.taxRate} scale={100} suffix="%" onChange={(taxRate) => upd(k, { taxRate })} /></label>}
            </div>
          </Card>
        ))}
        {pls.length < 5 && <Button className="w-full" onClick={() => set({ placements: [...pls, { label: `Placement ${pls.length + 1}`, grossRate: 0.04, annualFee: 0.01, entryFee: 0, taxMode: 'exit', taxRate: currentPFU() }] })}><Plus className="h-4 w-4" /> Ajouter un placement</Button>}
        <p className="text-[12px] text-muted px-1">Exemple de taux : 24,7 % = 7,5 % + 17,2 % (assurance-vie &gt; 8 ans, primes ≤ 150 000 €, avant abattement) ; {pct(currentPFU(), 1)} = PFU actuel.</p>
      </div>
    );
  },
  compute: (v) => {
    const pls = v.placements as Pl[];
    if (pls.some((p) => p.grossRate === null || p.annualFee === null || p.entryFee === null || p.taxRate === null)) throw new ValidationError(['Renseignez tous les taux des placements']);
    const r = comparePlacements(v as never);
    const sorted = [...r.results].sort((a, b) => b.finalValueNet - a.finalValueNet);
    return {
      report: {
        headline: { label: 'Meilleur capital net final', value: money(sorted[0].finalValueNet), tone: 'pos', sub: `${r.bestLabel} · écart de ${money(sorted[0].finalValueNet - sorted[sorted.length - 1].finalValueNet)} avec le moins performant` },
        metrics: sorted.map((x) => ({ label: x.label, value: money(x.finalValueNet), hint: `TRI net ${pct(x.netIRR)} · frais ${money(x.totalFees)} · impôts ${money(x.totalTax)}` })),
        tables: [{ title: 'Synthèse', columns: ['Placement', 'Capital net', 'TRI net', 'Frais', 'Impôts'], rows: sorted.map((x) => [x.label, money(x.finalValueNet), pct(x.netIRR), money(x.totalFees), money(x.totalTax)]) }],
        assumptions: ['Versements mensuels en début de mois.', 'Rendements bruts constants ; frais prélevés sur l’encours.', 'Fiscalité selon le mode choisi pour chaque placement ; abattements spécifiques non intégrés.'],
        warnings: [],
      },
      chart: <LineSeriesChart title="Valeur avant impôt de sortie" x="year" data={r.series} series={r.results.map((x) => ({ key: x.label, label: x.label }))} />,
    };
  },
  formula: ['Pour chaque placement : V_{t+1} = (V_t + versements) × (1 + r) × (1 − f)', 'Capital net = V_n − t × (V_n − Σ versements)'],
  example: 'À rendement brut égal, 1 % de frais annuels en plus coûte environ 9,5 % de capital final sur 10 ans.',
});

export const financeSims = [compound, xirr, cagr, netYield, discount, compare];

import { Plus, Trash2 } from 'lucide-react';
import { calculateAmortization, calculateLoanCapacity, calculateInFine, calculateLombard, calculatePledge, DEFAULT_LOMBARD_CLASSES, ValidationError } from '@/engine';
import { defineSim } from '../helpers';
import { money, pct, num } from '@/lib/format';
import { BarSeriesChart, LineSeriesChart } from '@/components/charts';
import { Badge, Button, Card } from '@/components/ui/primitives';
import { NumberInput, TextInput } from '@/components/ui/fields';

export const mortgage = defineSim('mortgage', {
  description: 'Mensualité constante, coût total, TAEG approché et tableau d’amortissement.',
  defaults: () => ({ principal: 800_000, annualRate: 0.034, years: 20, insuranceRate: 0.002, insuranceBasis: 'initial', fees: 2_500 }),
  fields: [
    { kind: 'money', key: 'principal', label: 'Montant emprunté', slider: { min: 50_000, max: 3_000_000, step: 10_000 } },
    { kind: 'percent', key: 'annualRate', label: 'Taux nominal annuel', slider: { min: 0, max: 7, step: 0.05 } },
    { kind: 'number', key: 'years', label: 'Durée', unit: 'ans', slider: { min: 5, max: 30, step: 1 } },
    { kind: 'percent', key: 'insuranceRate', label: 'Assurance emprunteur (taux annuel)', digits: 3 },
    { kind: 'segmented', key: 'insuranceBasis', label: 'Assiette de l’assurance', options: [{ value: 'initial', label: 'Capital initial' }, { value: 'outstanding', label: 'Capital restant dû' }] },
    { kind: 'money', key: 'fees', label: 'Frais de dossier et garantie' },
  ],
  compute: (v) => {
    const r = calculateAmortization(v as never);
    return {
      report: {
        headline: { label: 'Mensualité assurance comprise', value: money(r.paymentWithInsurance, { cents: true }), sub: `${r.months} mensualités · coût total ${money(r.totalCost)}` },
        metrics: [
          { label: 'Mensualité hors assurance', value: money(r.payment, { cents: true }) },
          { label: 'Assurance mensuelle (1re échéance)', value: money(r.monthlyInsurance, { cents: true }) },
          { label: 'Coût des intérêts', value: money(r.totalInterest), tone: 'neg' },
          { label: 'Coût de l’assurance', value: money(r.totalInsurance), tone: 'neg' },
          { label: 'Frais', value: money(v.fees) },
          { label: 'Coût total du crédit', value: money(r.totalCost), tone: 'neg' },
          { label: 'Total remboursé', value: money(r.totalPaid) },
          { label: 'TAEG approché', value: pct(r.taeg, 2), hint: 'Méthode actuarielle, hors frais de garantie non saisis' },
        ],
        tables: [
          { title: 'Amortissement annuel', columns: ['Année', 'Intérêts', 'Capital', 'Assurance', 'Restant dû'], rows: r.yearly.map((y) => [y.year, money(y.interest), money(y.principal), money(y.insurance), money(y.balance)]) },
          { title: 'Tableau d’amortissement mensuel', columns: ['Mois', 'Échéance', 'Intérêts', 'Capital', 'Restant dû'], rows: r.rows.map((x) => [x.period, money(x.payment + x.insurance, { cents: true }), money(x.interest, { cents: true }), money(x.principal, { cents: true }), money(x.balance)]), maxRowsInline: 12 },
        ],
        assumptions: ['Taux périodique proportionnel : taux annuel / 12.', 'Mensualité constante : M = C × i / (1 − (1 + i)^−n).', 'Dernière échéance ajustée pour solder exactement le capital.'],
        warnings: [],
      },
      chart: <BarSeriesChart title="Répartition annuelle des échéances" stacked x="year" data={r.yearly.map((y) => ({ year: y.year, principal: y.principal, interest: y.interest, insurance: y.insurance }))} series={[{ key: 'principal', label: 'Capital' }, { key: 'interest', label: 'Intérêts' }, { key: 'insurance', label: 'Assurance' }]} />,
    };
  },
  formula: ['M = C × i / (1 − (1 + i)^−n), i = taux / 12', 'Intérêts_k = CRD_{k−1} × i', 'TAEG : (1 + t)^12 − 1, t tel que Σ échéances actualisées = C − frais'],
  example: '200 000 € à 3,5 % sur 20 ans : mensualité de 1 159,92 €, 78 381 € d’intérêts.',
});

export const capacity = defineSim('capacity', {
  description: 'Capital empruntable à partir des revenus, des charges existantes et du taux d’effort cible.',
  defaults: () => ({ monthlyIncome: 18_000, existingCharges: 1_500, targetDebtRatio: 0.35, annualRate: 0.034, years: 20, insuranceRate: 0.002 }),
  fields: [
    { kind: 'money', key: 'monthlyIncome', label: 'Revenus nets mensuels du foyer' },
    { kind: 'money', key: 'existingCharges', label: 'Charges de crédit existantes / mois' },
    { kind: 'percent', key: 'targetDebtRatio', label: 'Taux d’endettement cible', slider: { min: 20, max: 50, step: 1 }, digits: 0, hint: 'Norme HCSF : 35 % assurance comprise.' },
    { kind: 'percent', key: 'annualRate', label: 'Taux du crédit' },
    { kind: 'number', key: 'years', label: 'Durée', unit: 'ans', slider: { min: 5, max: 30, step: 1 } },
    { kind: 'percent', key: 'insuranceRate', label: 'Assurance (taux annuel sur capital initial)', digits: 3 },
  ],
  compute: (v) => {
    const r = calculateLoanCapacity(v as never);
    return {
      report: {
        headline: { label: 'Capital empruntable', value: money(r.capacity), sub: `Mensualité disponible ${money(r.maxPayment)} / mois` },
        metrics: [
          { label: 'Mensualité hors assurance', value: money(r.payment) },
          { label: 'Assurance mensuelle', value: money(r.insurance) },
          { label: 'Taux d’endettement actuel', value: pct(r.currentRatio, 1) },
          { label: 'Coût total estimé', value: money(r.totalCost), tone: 'neg' },
        ],
        assumptions: ['Mensualité disponible = revenus × taux cible − charges existantes.', 'Assurance calculée sur le capital initial et incluse dans le taux d’effort.', 'Hors apport, reste à vivre et politique propre à chaque établissement.'],
        warnings: r.warnings,
      },
    };
  },
  formula: ['M_dispo = R × taux cible − charges', 'C = M_dispo / (i / (1 − (1 + i)^−n) + t_a / 12)'],
  example: '6 000 € de revenus, 35 %, 3,5 % sur 25 ans : 419 477 €.',
});

export const inFine = defineSim('in-fine', {
  description: 'Crédit in fine : intérêts périodiques, capital remboursé à l’échéance et adossement éventuel à un placement nanti.',
  defaults: () => ({ principal: 1_000_000, annualRate: 0.039, years: 10, frequency: 12, insuranceRate: 0, collateralCapital: 600_000, collateralRate: 0.045 }),
  fields: [
    { kind: 'money', key: 'principal', label: 'Capital emprunté' },
    { kind: 'percent', key: 'annualRate', label: 'Taux nominal annuel' },
    { kind: 'number', key: 'years', label: 'Durée', unit: 'ans', slider: { min: 1, max: 20, step: 1 } },
    { kind: 'segmented', key: 'frequency', label: 'Paiement des intérêts', options: [{ value: 12, label: 'Mensuel' }, { value: 4, label: 'Trimestriel' }, { value: 1, label: 'Annuel' }] },
    { kind: 'percent', key: 'insuranceRate', label: 'Assurance (taux annuel)', digits: 3 },
    { kind: 'group', label: 'Placement adossé (facultatif)' },
    { kind: 'money', key: 'collateralCapital', label: 'Capital placé et nanti' },
    { kind: 'percent', key: 'collateralRate', label: 'Rendement annuel net du placement' },
  ],
  compute: (v) => {
    const r = calculateInFine(v as never);
    return {
      report: {
        headline: { label: 'Échéance périodique', value: money(r.periodicPayment, { cents: true }), sub: `${r.periods} échéances · capital de ${money(v.principal)} dû in fine` },
        metrics: [
          { label: 'Intérêts par période', value: money(r.periodicInterest, { cents: true }) },
          { label: 'Coût total des intérêts', value: money(r.totalInterest), tone: 'neg' },
          { label: 'Coût de l’assurance', value: money(r.totalInsurance) },
          { label: 'Coût total', value: money(r.totalCost), tone: 'neg' },
          { label: 'Capital restant dû jusqu’à l’échéance', value: money(r.outstanding) },
          ...(v.collateralCapital > 0 ? [
            { label: 'Valeur du placement à l’échéance', value: money(r.collateralFinal) },
            { label: 'Excédent / déficit vs capital dû', value: money(r.collateralSurplus), tone: r.collateralSurplus >= 0 ? 'pos' as const : 'neg' as const },
            { label: 'Rendement nécessaire pour rembourser', value: pct(r.breakEvenRate) },
          ] : []),
        ],
        assumptions: ['Intérêts = capital × taux / fréquence, constants sur la durée.', 'Placement adossé capitalisé au rendement net saisi, sans retrait.'],
        warnings: v.collateralCapital > 0 && r.collateralSurplus < 0 ? ['Le placement adossé ne couvre pas le capital à rembourser selon ces hypothèses.'] : [],
      },
    };
  },
  formula: ['Intérêts périodiques = C × i / f', 'Coût = C × i × n', 'Placement : P × (1 + r)ⁿ vs C'],
  example: '500 000 € à 4 % sur 10 ans : 1 666,67 € d’intérêts mensuels, 200 000 € au total.',
});

/* ------------------------------ Lombard ------------------------------ */
type Line = { label: string; value: number | null; advanceRate: number | null; sensitivity: number | null };
const AssetLinesEditor = ({ lines, onChange, cols }: { lines: Line[]; onChange: (l: Line[]) => void; cols: 'lombard' | 'pledge' }) => {
  const upd = (k: number, p: Partial<Line>) => onChange(lines.map((x, i) => (i === k ? { ...x, ...p } : x)));
  return (
    <Card className="p-4">
      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-accent mb-3">{cols === 'lombard' ? 'Composition du portefeuille nanti' : 'Actifs remis en garantie'}</div>
      <div className="space-y-4">
        {lines.map((l, k) => (
          <div key={k} className="space-y-2 pb-3 border-b border-line/60 last:border-0 last:pb-0">
            <div className="flex gap-2 items-center">
              <div className="flex-1"><TextInput value={l.label} onChange={(label) => upd(k, { label })} maxLength={40} /></div>
              <Button variant="ghost" size="icon" aria-label="Supprimer la ligne" onClick={() => onChange(lines.filter((_, i) => i !== k))} disabled={lines.length <= 1}><Trash2 className="h-4 w-4 text-muted" /></Button>
            </div>
            <div className={cols === 'lombard' ? 'grid grid-cols-[1.6fr_1fr_1fr] gap-2' : 'grid grid-cols-[1.6fr_1fr] gap-2'}>
              <label className="text-[11px] text-muted space-y-1"><span>Valeur</span><NumberInput value={l.value} onChange={(value) => upd(k, { value })} suffix="€" /></label>
              <label className="text-[11px] text-muted space-y-1"><span>{cols === 'lombard' ? 'Avance' : 'Décote'}</span><NumberInput value={cols === 'lombard' ? l.advanceRate : l.advanceRate === null ? null : 1 - l.advanceRate} scale={100} suffix="%" onChange={(x) => upd(k, { advanceRate: x === null ? null : cols === 'lombard' ? x : 1 - x })} /></label>
              {cols === 'lombard' && <label className="text-[11px] text-muted space-y-1"><span>Sensibilité β</span><NumberInput value={l.sensitivity} onChange={(sensitivity) => upd(k, { sensitivity })} /></label>}
            </div>
          </div>
        ))}
      </div>
      <Button className="mt-3 w-full" onClick={() => onChange([...lines, { label: 'Autre actif', value: 0, advanceRate: 0.5, sensitivity: 1 }])}><Plus className="h-4 w-4" /> Ajouter une classe d’actifs</Button>
    </Card>
  );
};
const checkLines = (lines: Line[]) => {
  if (lines.some((l) => l.value === null || l.advanceRate === null || l.sensitivity === null)) throw new ValidationError(['Complétez la valeur, le ratio et la sensibilité de chaque ligne']);
};
const statusBadge = (s: string) => s === 'ok' ? <Badge tone="pos">Conforme</Badge> : s === 'alert' ? <Badge tone="warn">Alerte</Badge> : s === 'margin-call' ? <Badge tone="neg">Appel de marge</Badge> : <Badge tone="neg">Liquidation</Badge>;
const statusLabel = (s: string) => ({ ok: 'Conforme', alert: 'Alerte', 'margin-call': 'Appel de marge', liquidation: 'Liquidation' })[s] ?? s;

export const lombard = defineSim('lombard', {
  description: 'Montant empruntable sur un portefeuille nanti, LTV, coût, seuils d’alerte et de liquidation, et stress test de −10 % à −40 %.',
  defaults: () => ({
    assets: DEFAULT_LOMBARD_CLASSES.map((c) => ({ ...c, value: ({ 'Liquidités': 200_000, 'Obligations Investment Grade': 1_500_000, 'Actions grandes capitalisations': 2_000_000, 'Fonds diversifiés': 800_000, 'Produits structurés': 500_000 } as Record<string, number>)[c.label] ?? 0 })),
    loanAmount: 2_000_000, annualRate: 0.042, years: 3, alertThreshold: 0.9, marginCallThreshold: 1, liquidationThreshold: 1.1,
  }),
  fields: [
    { kind: 'group', label: 'Crédit' },
    { kind: 'money', key: 'loanAmount', label: 'Montant du crédit' },
    { kind: 'percent', key: 'annualRate', label: 'Taux d’intérêt annuel', hint: 'Souvent Euribor + marge.' },
    { kind: 'number', key: 'years', label: 'Durée', unit: 'ans' },
    { kind: 'group', label: 'Seuils (en % de la valeur de prêt)' },
    { kind: 'percent', key: 'alertThreshold', label: 'Seuil d’alerte', digits: 0 },
    { kind: 'percent', key: 'marginCallThreshold', label: 'Appel de marge', digits: 0 },
    { kind: 'percent', key: 'liquidationThreshold', label: 'Liquidation théorique', digits: 0 },
  ],
  customFormPosition: 'start',
  customForm: ({ values, set }) => <AssetLinesEditor cols="lombard" lines={values.assets} onChange={(assets) => set({ assets })} />,
  compute: (v) => {
    checkLines(v.assets);
    const r = calculateLombard({ ...v, assets: v.assets.filter((a: Line) => (a.value ?? 0) > 0), shocks: [0.1, 0.2, 0.3, 0.4] } as never);
    const shockTxt = (s: number) => (Number.isFinite(s) ? `− ${pct(s, 1)}` : 'Aucune');
    return {
      report: {
        headline: { label: 'Montant empruntable maximal', value: money(r.maxLoan), sub: `LTV initiale ${pct(r.initialLTV, 1)} · utilisation ${pct(r.initialUsage, 1)} de la valeur de prêt` },
        metrics: [
          { label: 'Valeur de marché du portefeuille', value: money(r.marketValue) },
          { label: 'Ratio d’avance moyen pondéré', value: pct(r.weightedAdvanceRate, 1) },
          { label: 'Marge disponible', value: money(r.headroom), tone: r.headroom >= 0 ? 'pos' : 'neg' },
          { label: 'Intérêts annuels', value: money(r.interestPerYear), hint: `${money(r.interestPerMonth)} / mois` },
          { label: `Coût du crédit sur ${v.years} ans`, value: money(r.totalInterest), tone: 'neg' },
          { label: 'Baisse de marché avant alerte', value: shockTxt(r.maxShockBeforeAlert), tone: 'accent' },
          { label: 'Baisse avant appel de marge', value: shockTxt(r.maxShockBeforeMarginCall), tone: 'accent' },
          { label: 'Baisse avant liquidation théorique', value: shockTxt(r.maxShockBeforeLiquidation), tone: 'neg' },
        ],
        tables: [
          { title: 'Stress test', columns: ['Choc marché', 'Valeur', 'Valeur de prêt', 'LTV', 'Utilisation', 'Statut'], rows: r.scenarios.map((s) => [s.shock === 0 ? 'Initial' : `− ${pct(s.shock, 0)}`, money(s.marketValue), money(s.lendingValue), pct(s.ltv, 1), pct(s.usage, 1), statusLabel(s.status)]) },
          { title: 'Valeur de prêt par classe', columns: ['Classe', 'Valeur', 'Poids', 'Avance', 'Valeur de prêt'], rows: r.lines.map((l) => [l.label, money(l.value), pct(l.weight, 1), pct(l.advanceRate, 0), money(l.lendingValue)]) },
        ],
        assumptions: ['Choc appliqué à chaque classe : baisse × sensibilité β (liquidités et monétaire β = 0).', 'Utilisation = encours / valeur de prêt ; LTV = encours / valeur de marché.', 'Intérêts in fine sur l’encours constant, sans capitalisation.'],
        warnings: r.warnings,
      },
      extra: (
        <Card className="p-4">
          <div className="text-[13px] font-semibold mb-3">Statut par scénario</div>
          <div className="grid grid-cols-5 gap-1.5 text-center">
            {r.scenarios.map((s) => (
              <div key={s.shock} className="space-y-1.5">
                <div className="text-[12px] text-muted tnum">{s.shock === 0 ? 'Initial' : `−${Math.round(s.shock * 100)} %`}</div>
                <div className="text-[13px] font-semibold tnum">{pct(s.usage, 0)}</div>
                {statusBadge(s.status)}
              </div>
            ))}
          </div>
        </Card>
      ),
      chart: <BarSeriesChart title="Valeur de prêt vs encours selon le choc" x="shock" valueFormat={money} data={r.scenarios.map((s) => ({ shock: s.shock === 0 ? 'Initial' : `−${Math.round(s.shock * 100)} %`, lending: s.lendingValue, loan: v.loanAmount }))} series={[{ key: 'lending', label: 'Valeur de prêt' }, { key: 'loan', label: 'Encours du crédit' }]} />,
    };
  },
  formula: ['Valeur de prêt = Σ Vᵢ × avanceᵢ', 'LTV = encours / Σ Vᵢ', 'Choc s : Vᵢ × (1 − s × βᵢ)', 'Choc max avant seuil θ : s* = (VP₀ − encours/θ) / Σ Vᵢ·avanceᵢ·βᵢ'],
  example: '1 M€ d’actions (60 %, β 1) + 500 k€ d’obligations (80 %, β 0,3), crédit de 600 k€ : valeur de prêt 1 M€, appel de marge après −55,6 %.',
});

export const pledge = defineSim('pledge', {
  description: 'Valeur éligible d’un nantissement après décote par catégorie, et capacité de couverture d’un engagement.',
  defaults: () => ({
    exposure: 1_500_000,
    assets: [
      { label: 'Contrat d’assurance-vie — fonds euros', value: 800_000, advanceRate: 0.9, sensitivity: 0 },
      { label: 'Compte-titres — actions', value: 1_000_000, advanceRate: 0.6, sensitivity: 1 },
      { label: 'Obligations', value: 400_000, advanceRate: 0.8, sensitivity: 0.3 },
    ],
  }),
  fields: [{ kind: 'money', key: 'exposure', label: 'Engagement à couvrir' }],
  customFormPosition: 'start',
  customForm: ({ values, set }) => <AssetLinesEditor cols="pledge" lines={values.assets} onChange={(assets) => set({ assets })} />,
  compute: (v) => {
    checkLines(v.assets);
    const r = calculatePledge({ exposure: v.exposure, assets: (v.assets as Line[]).map((a) => ({ label: a.label, value: a.value!, haircut: 1 - a.advanceRate! })) });
    return {
      report: {
        headline: { label: 'Ratio de couverture', value: Number.isFinite(r.coverageRatio) ? pct(r.coverageRatio, 1) : '∞', tone: r.covered ? 'pos' : 'neg', sub: r.covered ? `Engagement couvert · excédent ${money(r.surplus)}` : `Insuffisance de ${money(r.additionalCollateralNeeded)}` },
        metrics: [
          { label: 'Valeur totale des actifs', value: money(r.total) },
          { label: 'Décote moyenne', value: pct(r.averageHaircut, 1) },
          { label: 'Valeur éligible', value: money(r.eligible), tone: 'accent' },
          { label: 'Engagement', value: money(v.exposure) },
          { label: r.covered ? 'Excédent de garantie' : 'Garantie complémentaire nécessaire', value: money(r.covered ? r.surplus : r.additionalCollateralNeeded), tone: r.covered ? 'pos' : 'neg' },
        ],
        tables: [{ title: 'Détail par actif', columns: ['Actif', 'Valeur', 'Décote', 'Éligible'], rows: r.lines.map((l) => [l.label, money(l.value), pct(l.haircut, 0), money(l.eligible)]) }],
        assumptions: ['Valeur éligible = valeur × (1 − décote).', 'Décotes indicatives, à aligner sur la politique de risque de l’établissement.'],
        warnings: [],
      },
    };
  },
  formula: ['VE = Σ Vᵢ × (1 − dᵢ)', 'Ratio = VE / engagement'],
  example: '100 000 € décotés de 10 % et 50 000 € décotés de 50 % couvrent 115 000 € d’engagement.',
});

export const creditSims = [mortgage, capacity, inFine, lombard, pledge];
export { num, LineSeriesChart };

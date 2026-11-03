import { useState } from 'react';
import { calculateBondYield, calculateAutocall, runStructured, observationDates, buildPath, structuredSchema, STANDARD_SCENARIOS, todayISO, addMonths, parseISO, toISO, validate, ValidationError, type ScenarioResult, type StructuredInput } from '@/engine';
import { defineSim, currentPFU } from '../helpers';
import { money, pct, num, dateFR, years as fmtYears } from '@/lib/format';
import { BarSeriesChart, LineSeriesChart } from '@/components/charts';
import { Badge, Button, Card } from '@/components/ui/primitives';
import { NumberInput, Select } from '@/components/ui/fields';
import { DataTable } from '@/components/sim/ResultBlocks';
import type { FieldDef, SimulatorDef, Values } from '../types';
import { cn } from '@/lib/cn';

/* ============================== Obligation ============================== */
export const bond = defineSim('bond', {
  description: 'Prix pied de coupon et plein coupon, coupon couru, rendement actuariel, rendement courant, duration et rendement net indicatif.',
  defaults: (s) => ({
    nominal: 500_000, couponRate: 0.0425, frequency: 1, settlementDate: todayISO(), maturityDate: toISO(addMonths(parseISO(todayISO()), 76)),
    dayCount: s.dayCount, mode: 'price-to-yield', cleanPrice: 98.5, yieldRate: 0.045, redemption: 100, taxRate: currentPFU(),
  }),
  fields: [
    { kind: 'group', label: 'Caractéristiques' },
    { kind: 'money', key: 'nominal', label: 'Nominal investi' },
    { kind: 'percent', key: 'couponRate', label: 'Coupon annuel', digits: 3 },
    { kind: 'segmented', key: 'frequency', label: 'Fréquence du coupon', options: [{ value: 1, label: 'Annuel' }, { value: 2, label: 'Semestriel' }, { value: 4, label: 'Trimestriel' }] },
    { kind: 'date', key: 'maturityDate', label: 'Date d’échéance' },
    { kind: 'number', key: 'redemption', label: 'Prix de remboursement', unit: '%' },
    { kind: 'select', key: 'dayCount', label: 'Base de calcul', options: [{ value: 'ACT/ACT', label: 'Exact/Exact (ICMA)' }, { value: 'ACT/365', label: 'Exact/365' }, { value: 'ACT/360', label: 'Exact/360' }, { value: '30/360', label: '30/360' }] },
    { kind: 'group', label: 'Transaction' },
    { kind: 'date', key: 'settlementDate', label: 'Date de règlement' },
    { kind: 'segmented', key: 'mode', label: 'Calculer', options: [{ value: 'price-to-yield', label: 'Rendement depuis le prix' }, { value: 'yield-to-price', label: 'Prix depuis le rendement' }] },
    { kind: 'number', key: 'cleanPrice', label: 'Prix d’achat pied de coupon', unit: '%', visibleIf: (v) => v.mode === 'price-to-yield' },
    { kind: 'percent', key: 'yieldRate', label: 'Rendement actuariel visé', digits: 3, visibleIf: (v) => v.mode === 'yield-to-price' },
    { kind: 'percent', key: 'taxRate', label: 'Fiscalité indicative (coupons et plus-value)', hint: `PFU en vigueur : ${pct(currentPFU(), 1)}.` },
  ],
  compute: (v) => {
    const r = calculateBondYield(v as never);
    return {
      report: {
        headline: { label: v.mode === 'price-to-yield' ? 'Rendement actuariel à l’échéance' : 'Prix pied de coupon', value: v.mode === 'price-to-yield' ? pct(r.yieldToMaturity, 3) : `${num(r.cleanPrice, 4)} %`, tone: 'accent', sub: `Prix plein coupon ${num(r.dirtyPrice, 4)} % · échéance dans ${fmtYears(r.yearsToMaturity)}` },
        metrics: [
          { label: 'Prix pied de coupon', value: `${num(r.cleanPrice, 4)} %` },
          { label: 'Coupon couru', value: `${num(r.accruedInterest, 4)} %`, hint: `${money(r.accruedAmount, { cents: true })} · ${num(r.accruedDays, 0)} j / ${num(r.periodDays, 1)}` },
          { label: 'Prix plein coupon', value: `${num(r.dirtyPrice, 4)} %` },
          { label: 'Montant à décaisser', value: money(r.cost, { cents: true }), tone: 'accent' },
          { label: 'Rendement actuariel (convention de marché)', value: pct(r.yieldToMaturity, 3) },
          { label: 'Rendement annuel effectif', value: pct(r.annualEffectiveYield, 3) },
          { label: 'Rendement courant', value: pct(r.currentYield, 3) },
          { label: 'Rendement net indicatif après fiscalité', value: pct(r.netYieldAfterTax, 3) },
          { label: 'Plus / moins-value à l’échéance', value: money(r.capitalGain), tone: r.capitalGain >= 0 ? 'pos' : 'neg' },
          { label: 'Coupons restant à percevoir', value: `${r.remainingCoupons} × ${money(r.couponAmount)}` },
          { label: 'Duration de Macaulay', value: `${num(r.macaulayDuration, 3)} ans` },
          { label: 'Sensibilité (duration modifiée)', value: num(r.modifiedDuration, 3), hint: `+1 % de taux ≈ ${pct(-r.modifiedDuration / 100, 2)} de prix` },
          { label: 'Convexité', value: num(r.convexity, 2) },
        ],
        tables: [{ title: 'Échéancier des flux', columns: ['Date', 'Coupon', 'Remboursement'], rows: r.schedule.map((s) => [dateFR(s.date), money(s.coupon), s.principal ? money(s.principal) : '—']) }],
        assumptions: [
          'Obligation à taux fixe remboursée in fine, sans clause de remboursement anticipé ni risque de défaut.',
          `Coupon précédent ${dateFR(r.previousCoupon)}, prochain ${dateFR(r.nextCoupon)} (échéancier reconstruit depuis la maturité).`,
          'Rendement actuariel selon la convention de marché (identique aux fonctions PRICE / YIELD d’Excel) : taux nominal capitalisé à la fréquence du coupon.',
          'Rendement net : coupons et plus-value taxés au taux saisi ; moins-value non imputée ; coupon couru payé non déduit.',
        ],
        warnings: [],
      },
    };
  },
  formula: ['P_plein = Σ (100·c/f) / (1 + y/f)^(k−1+w) + R / (1 + y/f)^(N−1+w)', 'w = jours jusqu’au prochain coupon / jours de la période', 'Coupon couru = (100·c/f) × jours courus / jours de la période', 'Rendement courant = coupon / prix pied de coupon'],
  example: 'Référence Excel : coupon 5,75 %, semestriel, base 30/360, règlement 15/02/2008, échéance 15/11/2016, prix 95,04287 → rendement 6,500 %.',
});

/* ============================== Structurés ============================== */
const OBS_OPTIONS = [{ value: 1, label: 'Annuelle' }, { value: 2, label: 'Semestrielle' }, { value: 4, label: 'Trimestrielle' }, { value: 12, label: 'Mensuelle' }];

function structuredFields(type: 'autocall' | 'phoenix' | 'reverse-convertible' | 'any'): FieldDef[] {
  const isRC = (v: Values) => (type === 'any' ? v.productType === 'reverse-convertible' : type === 'reverse-convertible');
  const notRC = (v: Values) => !isRC(v);
  return [
    { kind: 'group', label: 'Caractéristiques' },
    ...(type === 'any' ? [{ kind: 'select', key: 'productType', label: 'Type de produit', options: [{ value: 'autocall', label: 'Autocall (coupon au rappel)' }, { value: 'phoenix', label: 'Phoenix (coupon périodique)' }, { value: 'reverse-convertible', label: 'Reverse convertible' }] } as FieldDef] : []),
    { kind: 'money', key: 'capital', label: 'Capital investi' },
    { kind: 'text', key: 'underlying', label: 'Sous-jacent', maxLength: 60, placeholder: 'Ex. Euro Stoxx 50' },
    { kind: 'number', key: 'initialLevel', label: 'Niveau initial du sous-jacent', unit: 'pts' },
    { kind: 'date', key: 'issueDate', label: 'Date de constatation initiale' },
    { kind: 'number', key: 'maturityYears', label: 'Durée maximale', unit: 'ans', slider: { min: 1, max: 12, step: 1 } },
    { kind: 'select', key: 'observationsPerYear', label: 'Fréquence d’observation', options: OBS_OPTIONS },
    { kind: 'group', label: 'Coupon' },
    { kind: 'percent', key: 'couponRate', label: isRC({}) && type === 'reverse-convertible' ? 'Coupon fixe annuel' : 'Coupon conditionnel annuel', digits: 2, hint: 'Versé à raison de coupon / fréquence par observation.' },
    { kind: 'percent', key: 'couponBarrier', label: 'Barrière de coupon', digits: 0, visibleIf: notRC, hint: 'En % du niveau initial.' },
    { kind: 'toggle', key: 'memory', label: 'Effet mémoire', visibleIf: notRC, hint: 'Rattrapage des coupons non versés (Phoenix) ou coupons cumulés au rappel (Autocall).' },
    { kind: 'group', label: 'Remboursement anticipé', visibleIf: notRC },
    { kind: 'percent', key: 'autocallBarrier', label: 'Barrière de rappel automatique', digits: 0, visibleIf: notRC },
    { kind: 'percent', key: 'autocallStepDown', label: 'Dégressivité par observation', digits: 1, visibleIf: notRC, hint: '0 % si barrière fixe.' },
    { kind: 'number', key: 'firstCallObservation', label: 'Première observation de rappel', integer: true, visibleIf: notRC, hint: 'Rang de l’observation (1 = première).' },
    { kind: 'group', label: 'Protection du capital' },
    { kind: 'percent', key: 'protectionBarrier', label: 'Barrière de protection à maturité', digits: 0 },
    { kind: 'segmented', key: 'barrierType', label: 'Type de barrière', options: [{ value: 'european', label: 'Européenne (échéance)' }, { value: 'american', label: 'Américaine (continue)' }] },
    { kind: 'percent', key: 'strike', label: 'Strike (niveau de référence des pertes)', digits: 0 },
  ];
}

const structuredDefaults = (type: StructuredInput['productType']): Values => ({
  productType: type,
  capital: 1_000_000,
  underlying: '',
  initialLevel: 100,
  issueDate: todayISO(),
  maturityYears: type === 'reverse-convertible' ? 2 : 8,
  observationsPerYear: type === 'phoenix' ? 4 : 1,
  couponRate: type === 'reverse-convertible' ? 0.075 : type === 'phoenix' ? 0.08 : 0.09,
  couponBarrier: type === 'phoenix' ? 0.7 : 1,
  memory: true,
  autocallBarrier: 1,
  autocallStepDown: 0,
  firstCallObservation: type === 'phoenix' ? 4 : 1,
  protectionBarrier: type === 'reverse-convertible' ? 0.7 : 0.6,
  barrierType: 'european',
  strike: 1,
  pathShape: 'linear',
});

function ScenarioDetail({ scenarios, initialLevel }: { scenarios: ScenarioResult[]; initialLevel: number }) {
  const [idx, setIdx] = useState(Math.min(2, scenarios.length - 1));
  const s = scenarios[Math.min(idx, scenarios.length - 1)];
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="text-[13px] font-semibold mb-2">Tableau chronologique des observations</div>
        <Select value={idx} onChange={setIdx} options={scenarios.map((x, k) => ({ value: k, label: x.label }))} />
        <div className="mt-3 flex flex-wrap gap-2">
          {s.redeemedEarly ? <Badge tone="accent">Rappel le {dateFR(s.redemptionDate)}</Badge> : <Badge>Échéance {dateFR(s.redemptionDate)}</Badge>}
          {s.capitalLoss ? <Badge tone="neg">Perte en capital</Badge> : <Badge tone="pos">Capital préservé</Badge>}
          <Badge>TRI {pct(s.annualizedReturn)}</Badge>
        </div>
      </Card>
      <DataTable table={{
        title: `${s.label} — ${money(s.totalReceived)} perçus`,
        columns: ['Obs.', 'Date', 'Niveau', 'Barrière rappel', 'Coupon', 'Capital', 'Événement'],
        align: ['left', 'left', 'right', 'right', 'right', 'right', 'left'],
        rows: s.rows.map((r) => [r.index, dateFR(r.date), `${pct(r.level, 1)} · ${num(r.level * initialLevel, 2)}`, r.autocallBarrier === null ? '—' : pct(r.autocallBarrier, 0), money(r.coupon), r.capitalRedeemed ? money(r.capitalRedeemed) : '—', r.event]),
        maxRowsInline: 48,
      }} />
    </div>
  );
}

function structuredReport(v: Values, scenarios: ScenarioResult[], pathNote: string) {
  const ref = scenarios.find((s) => s.label === 'Marché stable') ?? scenarios[0];
  const worst = scenarios.reduce((a, b) => (b.totalReceived < a.totalReceived ? b : a));
  const nObs = observationDates(validate(structuredSchema, v)).length;
  const typeLabel = v.productType === 'phoenix' ? 'Phoenix' : v.productType === 'autocall' ? 'Autocall' : 'Reverse convertible';
  return {
    report: {
      headline: { label: `Total remboursé — ${ref.label.toLowerCase()}`, value: money(ref.totalReceived), tone: ref.capitalLoss ? 'neg' as const : 'pos' as const, sub: `${ref.redeemedEarly ? `Rappel au bout de ${fmtYears(ref.durationYears)}` : `Échéance (${fmtYears(ref.durationYears)})`} · TRI ${pct(ref.annualizedReturn)}` },
      metrics: scenarios.map((s) => ({ label: s.label, value: money(s.totalReceived), tone: s.capitalLoss ? 'neg' as const : s.gain > 0 ? 'pos' as const : undefined, hint: `${s.redeemedEarly ? `rappel ${dateFR(s.redemptionDate)}` : 'échéance'} · coupons ${money(s.totalCoupons)} · TRI ${pct(s.annualizedReturn)}` })),
      tables: [
        { title: 'Synthèse par scénario', columns: ['Scénario', 'Fin', 'Durée', 'Coupons', 'Capital', 'Total', 'TRI'], rows: scenarios.map((s) => [s.label, dateFR(s.redemptionDate), fmtYears(s.durationYears), money(s.totalCoupons), money(s.capitalReturned), money(s.totalReceived), pct(s.annualizedReturn)]) },
        ...scenarios.map((s) => ({ title: `Observations — ${s.label}`, pdfOnly: true, columns: ['Obs.', 'Date', 'Niveau', 'Coupon', 'Capital', 'Événement'], rows: s.rows.map((r) => [r.index, dateFR(r.date), pct(r.level, 1), money(r.coupon), r.capitalRedeemed ? money(r.capitalRedeemed) : '—', r.event]) })),
      ],
      assumptions: [
        `${typeLabel}${v.underlying ? ` sur ${v.underlying}` : ''} — ${nObs} dates d’observation (${OBS_OPTIONS.find((o) => o.value === v.observationsPerYear)?.label.toLowerCase()}), niveaux en % du niveau initial (${num(v.initialLevel, 2)}).`,
        pathNote,
        v.productType === 'reverse-convertible' ? `Coupon fixe de ${pct(v.couponRate)} par an, versé quelle que soit l’évolution du sous-jacent.` : `Coupon ${pct(v.couponRate)} par an, barrière de coupon ${pct(v.couponBarrier, 0)}, ${v.memory ? 'avec' : 'sans'} effet mémoire ; rappel si niveau ≥ ${pct(v.autocallBarrier, 0)}${v.autocallStepDown > 0 ? ` (−${pct(v.autocallStepDown, 1)} par observation)` : ''} dès l’observation ${v.firstCallObservation}.`,
        `À l’échéance : capital protégé si ${v.barrierType === 'european' ? 'niveau final' : 'la barrière n’a jamais été franchie (approximation aux dates d’observation) ou niveau final ≥ strike'} ≥ ${pct(v.protectionBarrier, 0)} ; sinon remboursement = capital × niveau final / ${pct(v.strike, 0)}.`,
        'TRI calculé sur les flux aux dates d’observation (paiement supposé à la date d’observation).',
      ],
      warnings: [
        'Les montants s’entendent hors risque de crédit de l’émetteur/garant, hors frais, hors fiscalité, et pour un produit conservé jusqu’au rappel ou à l’échéance. La valeur de revente en cours de vie peut être très différente.',
        `Pire scénario présenté : ${worst.label} → ${money(worst.totalReceived)} (${pct(worst.totalReceived / v.capital - 1, 1, true)}).`,
        'Les conditions saisies doivent reprendre exactement la documentation contractuelle (term sheet / KID) du produit.',
      ],
    },
    chart: <BarSeriesChart title="Montant total perçu par scénario" x="s" stacked data={scenarios.map((s) => ({ s: s.label.replace('Hausse de ', '+').replace('Baisse de ', '−').replace('Marché stable', 'Stable'), capital: s.capitalReturned, coupons: s.totalCoupons }))} series={[{ key: 'capital', label: 'Capital' }, { key: 'coupons', label: 'Coupons' }]} />,
    extra: <ScenarioDetail scenarios={scenarios} initialLevel={v.initialLevel} />,
  };
}

function makeStructured(id: 'autocall' | 'phoenix' | 'reverse-convertible', description: string, formula: string[], example: string): SimulatorDef {
  return defineSim(id, {
    description,
    defaults: () => structuredDefaults(id),
    fields: [
      ...structuredFields(id),
      { kind: 'group', label: 'Scénarios de marché' },
      { kind: 'segmented', key: 'pathShape', label: 'Trajectoire du sous-jacent', options: [{ value: 'linear', label: 'Progressive (linéaire)' }, { value: 'immediate', label: 'Choc immédiat' }], hint: 'Progressive : le sous-jacent atteint la performance finale à l’échéance. Choc immédiat : niveau constant dès la 1re observation.' },
    ],
    compute: (v) => {
      const scenarios = calculateAutocall({ ...v, productType: id } as never, v.pathShape);
      const note = v.pathShape === 'immediate' ? 'Scénarios « choc immédiat » : le sous-jacent est au niveau final dès la première observation et y reste.' : 'Scénarios « progressifs » : le sous-jacent évolue linéairement de 100 % jusqu’au niveau final à la dernière observation (un scénario de hausse est donc rappelé dès que le niveau franchit la barrière).';
      return structuredReport({ ...v, productType: id }, scenarios, note);
    },
    formula,
    example,
  });
}

export const autocall = makeStructured('autocall',
  'Autocall (type Athéna) : coupon versé uniquement en cas de rappel ou à l’échéance, avec effet mémoire, barrières de rappel, de coupon et de protection.',
  ['Rappel à l’obs. k si S_k ≥ B_rappel(k) : capital + coupon × k (mémoire) ou × 1', 'Échéance : S_N ≥ B_coupon → capital + coupons ; S_N ≥ B_protection → capital ; sinon capital × S_N / strike'],
  'Coupon 10 %/an, rappel à 100 % : un sous-jacent à 90 %, 95 % puis 105 % déclenche un rappel en année 3 avec 30 % de coupons cumulés.');
export const phoenix = makeStructured('phoenix',
  'Phoenix : coupon conditionnel versé à chaque observation au-dessus de la barrière de coupon, effet mémoire, rappel automatique et protection conditionnelle.',
  ['Coupon_k = c/f × (1 + coupons manqués si mémoire) si S_k ≥ B_coupon', 'Rappel si S_k ≥ B_rappel(k) et k ≥ 1re date de rappel', 'Échéance : S_N ≥ B_protection → capital ; sinon capital × S_N / strike'],
  'Coupon 8 %, barrière 70 %, mémoire : 65 %, 65 % puis 80 % → 3 coupons versés à la 3e observation.');
export const reverseConvertible = makeStructured('reverse-convertible',
  'Reverse convertible : coupon fixe garanti et remboursement du capital conditionné par une barrière de protection.',
  ['Coupon_k = C × c / f (inconditionnel)', 'Échéance : S_N ≥ B (ou barrière non franchie) → C ; sinon C × S_N / strike'],
  'Coupon 7 %, barrière 70 % : à −20 % le capital est rendu, à −40 % il est remboursé à 60 %.');

/* ======================= Simulateur de scénarios personnalisés ======================= */
export const scenarios = defineSim('scenarios', {
  description: 'Définissez vous-même le niveau du sous-jacent à chaque date d’observation et comparez-le aux scénarios standards.',
  defaults: () => ({ ...structuredDefaults('phoenix'), maturityYears: 5, observationsPerYear: 1, firstCallObservation: 1, customPath: [0.95, 0.82, 0.68, 0.74, 0.88] }),
  fields: structuredFields('any'),
  customForm: ({ values, set }) => {
    let dates: string[] = [];
    try { dates = observationDates(validate(structuredSchema, values)); } catch { dates = []; }
    const path: (number | null)[] = Array.from({ length: dates.length }, (_, k) => values.customPath?.[k] ?? 1);
    const preset = (perf: number, shape: 'linear' | 'immediate') => set({ customPath: buildPath(perf, dates.length, shape) });
    return (
      <Card className="p-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-accent mb-1">Trajectoire personnalisée</div>
        <p className="text-xs text-muted mb-3">Niveau du sous-jacent à chaque observation, en % du niveau initial.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {[-0.5, -0.3, 0, 0.2].map((p) => <Button key={p} size="sm" onClick={() => preset(p, 'linear')}>{p === 0 ? 'Stable' : `${p > 0 ? '+' : '−'}${Math.abs(p * 100)} % linéaire`}</Button>)}
          <Button size="sm" onClick={() => set({ customPath: dates.map((_, k) => (k % 2 ? 0.75 : 0.95)) })}>Volatil</Button>
        </div>
        {dates.length > 60 ? <p className="text-xs text-neg">Trop d’observations pour une saisie manuelle (max 60).</p> : (
          <div className="grid grid-cols-2 gap-2">
            {dates.map((d, k) => (
              <label key={d} className="text-[11px] text-muted space-y-1">
                <span>Obs. {k + 1} · {dateFR(d)}</span>
                <NumberInput value={path[k]} scale={100} suffix="%" onChange={(x) => { const np = [...path]; np[k] = x; set({ customPath: np }); }} />
              </label>
            ))}
          </div>
        )}
      </Card>
    );
  },
  compute: (v) => {
    const p = validate(structuredSchema, v);
    const n = observationDates(p).length;
    if (n > 60) throw new ValidationError(['Maximum 60 observations pour le simulateur personnalisé']);
    const path: (number | null)[] = Array.from({ length: n }, (_, k) => v.customPath?.[k] ?? 1);
    if (path.some((x) => x === null)) throw new ValidationError(['Renseignez le niveau de chaque observation']);
    const custom = runStructured(p, path as number[], 'Trajectoire personnalisée');
    const std = STANDARD_SCENARIOS.filter((s) => [0, -0.2, -0.4].includes(s.perf)).map((s) => runStructured(p, buildPath(s.perf, n, 'linear'), s.label));
    const out = structuredReport(v, [custom, ...std], 'Trajectoire personnalisée saisie observation par observation, comparée à trois scénarios progressifs standards.');
    out.report.headline = { label: 'Trajectoire personnalisée — total perçu', value: money(custom.totalReceived), tone: custom.capitalLoss ? 'neg' : 'pos', sub: `${custom.redeemedEarly ? `Rappel le ${dateFR(custom.redemptionDate)}` : `Échéance le ${dateFR(custom.redemptionDate)}`} · TRI ${pct(custom.annualizedReturn)}` };
    return {
      ...out,
      chart: (
        <div className="space-y-4">
          <LineSeriesChart title="Trajectoire et barrières" x="obs" xLabel={(o) => `Observation ${o}`} valueFormat={(x) => pct(x, 1)} yFormat={(x) => pct(x, 0)} data={path.map((l, k) => ({ obs: k + 1, level: l as number, coupon: p.productType === 'reverse-convertible' ? NaN : p.couponBarrier, protection: p.protectionBarrier }))} series={[{ key: 'level', label: 'Sous-jacent' }, ...(p.productType === 'reverse-convertible' ? [] : [{ key: 'coupon', label: 'Barrière de coupon' }]), { key: 'protection', label: 'Barrière de protection' }]} />
          {out.chart}
        </div>
      ),
    };
  },
  formula: ['Moteur identique aux fiches Autocall / Phoenix / Reverse convertible, appliqué à la trajectoire saisie.'],
  example: 'Phoenix 8 %, barrière 70 %, trajectoire 95 / 82 / 68 / 74 / 88 % : coupons aux observations 1, 2, puis 4 avec rattrapage de l’observation 3.',
});

export const marketSims = [bond, autocall, phoenix, reverseConvertible, scenarios];
export { cn };

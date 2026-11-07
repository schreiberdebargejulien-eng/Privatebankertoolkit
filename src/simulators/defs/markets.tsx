import { useState } from 'react';
import { calculateBondYield, calculateAutocall, runStructured, observationDates, buildPath, buildVolatilePath, taxStructuredScenario, structuredSchema, STANDARD_SCENARIOS, todayISO, addMonths, parseISO, toISO, validate, ValidationError, type ScenarioResult, type StructuredInput } from '@/engine';
import { defineSim, taxFields, taxDefaults, resolveTax } from '../helpers';
import { money, pct, num, dateFR, years as fmtYears } from '@/lib/format';
import { BarSeriesChart, LineSeriesChart } from '@/components/charts';
import { Badge, Button, Card, FormCard } from '@/components/ui/primitives';
import { NumberInput, Select } from '@/components/ui/fields';
import { DataTable } from '@/components/sim/ResultBlocks';
import type { FieldDef, Values } from '../types';
import { cn } from '@/lib/cn';

/* ============================== Obligation ============================== */
export const bond = defineSim('bond', {
  description: 'Prix pied de coupon et plein coupon, coupon couru, rendement actuariel, rendement courant, duration et rendement net indicatif.',
  defaults: (s) => ({
    nominal: 500_000, couponRate: 0.0425, frequency: 1, settlementDate: todayISO(), maturityDate: toISO(addMonths(parseISO(todayISO()), 76)),
    dayCount: s.dayCount, mode: 'price-to-yield', cleanPrice: 98.5, yieldRate: 0.045, redemption: 100, ...taxDefaults('pfu'),
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
    ...taxFields({ group: 'Fiscalité (coupons et plus-value)' }),
  ],
  compute: (v) => {
    const t0 = resolveTax(v, 0);
    const r = calculateBondYield({ ...v, taxRate: t0.rate } as never);
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
          { label: 'Rendement net indicatif après fiscalité', value: pct(r.netYieldAfterTax, 3), hint: `${t0.label} · ${pct(t0.rate, 1)}` },
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
          'Rendement net : coupons et plus-value taxés au taux du régime retenu ; moins-value non imputée ; coupon couru payé non déduit.',
          `Fiscalité : ${t0.note}`,
          ...(v.taxRegime === 'is' ? ['IS : les intérêts courus sont en principe imposés à chaque exercice et l’écart entre prix d’acquisition et valeur de remboursement (prime / décote) étalé (art. 238 septies B CGI) ; le rendement net reste ici une approximation.'] : []),
        ],
        warnings: [],
        rules: t0.ruleIds,
      },
    };
  },
  formula: ['P_plein = Σ (100·c/f) / (1 + y/f)^(k−1+w) + R / (1 + y/f)^(N−1+w)', 'w = jours jusqu’au prochain coupon / jours de la période', 'Coupon couru = (100·c/f) × jours courus / jours de la période', 'Rendement courant = coupon / prix pied de coupon'],
  example: 'Référence Excel : coupon 5,75 %, semestriel, base 30/360, règlement 15/02/2008, échéance 15/11/2016, prix 95,04287 → rendement 6,500 %.',
});

/* ============================== Structurés ============================== */
const OBS_OPTIONS = [{ value: 1, label: 'Annuelle' }, { value: 2, label: 'Semestrielle' }, { value: 4, label: 'Trimestrielle' }, { value: 12, label: 'Mensuelle' }];
const PRODUCT_OPTIONS = [
  { value: 'autocall', label: 'Autocall / Athéna (coupon au rappel)' },
  { value: 'phoenix', label: 'Phoenix (coupon conditionnel périodique)' },
  { value: 'reverse-convertible', label: 'Reverse convertible (coupon fixe)' },
  { value: 'capital-protected', label: 'Capital protégé (participation à la hausse)' },
];
const PRODUCT_LABEL: Record<string, string> = { autocall: 'Autocall', phoenix: 'Phoenix', 'reverse-convertible': 'Reverse convertible', 'capital-protected': 'Capital protégé' };
const isCallable = (v: Values) => v.productType === 'autocall' || v.productType === 'phoenix';
const isCP = (v: Values) => v.productType === 'capital-protected';

function structuredFields(): FieldDef[] {
  return [
    { kind: 'group', label: 'Caractéristiques' },
    { kind: 'select', key: 'productType', label: 'Type de produit', options: PRODUCT_OPTIONS },
    { kind: 'money', key: 'capital', label: 'Capital investi' },
    { kind: 'text', key: 'underlying', label: 'Sous-jacent', maxLength: 60, placeholder: 'Ex. Euro Stoxx 50' },
    { kind: 'number', key: 'initialLevel', label: 'Niveau initial du sous-jacent', unit: 'pts' },
    { kind: 'date', key: 'issueDate', label: 'Date de constatation initiale' },
    { kind: 'number', key: 'maturityYears', label: 'Durée maximale', unit: 'ans', slider: { min: 1, max: 12, step: 1 } },
    { kind: 'select', key: 'observationsPerYear', label: 'Fréquence d’observation', options: OBS_OPTIONS },
    { kind: 'group', label: 'Coupon' },
    { kind: 'percent', key: 'couponRate', label: 'Coupon annuel', digits: 2, hint: 'Autocall : versé au rappel ou à l’échéance · Phoenix : conditionnel · Reverse convertible / capital protégé : fixe (0 % si aucun). Versé à raison de coupon / fréquence par observation.' },
    { kind: 'percent', key: 'couponBarrier', label: 'Barrière de coupon', digits: 0, visibleIf: isCallable, hint: 'En % du niveau initial.' },
    { kind: 'toggle', key: 'memory', label: 'Effet mémoire', visibleIf: isCallable, hint: 'Rattrapage des coupons non versés (Phoenix) ou coupons cumulés au rappel (Autocall).' },
    { kind: 'group', label: 'Remboursement anticipé', visibleIf: isCallable },
    { kind: 'percent', key: 'autocallBarrier', label: 'Barrière de rappel automatique', digits: 0, visibleIf: isCallable },
    { kind: 'percent', key: 'autocallStepDown', label: 'Dégressivité par observation', digits: 1, visibleIf: isCallable, hint: '0 % si barrière fixe.' },
    { kind: 'number', key: 'firstCallObservation', label: 'Première observation de rappel', integer: true, visibleIf: isCallable, hint: 'Rang de l’observation (1 = première).' },
    { kind: 'group', label: 'Protection du capital' },
    { kind: 'percent', key: 'protectionBarrier', label: 'Barrière de protection à maturité', digits: 0, visibleIf: (v) => !isCP(v) },
    { kind: 'segmented', key: 'barrierType', label: 'Type de barrière', options: [{ value: 'european', label: 'Européenne (échéance)' }, { value: 'american', label: 'Américaine (continue)' }], visibleIf: (v) => !isCP(v) },
    { kind: 'percent', key: 'strike', label: 'Strike (niveau de référence des pertes)', digits: 0, visibleIf: (v) => !isCP(v) },
    { kind: 'percent', key: 'protectionLevel', label: 'Niveau de protection du capital', digits: 0, visibleIf: isCP, hint: 'Remboursement minimal à l’échéance (100 % = capital garanti, hors risque émetteur).' },
    { kind: 'percent', key: 'participation', label: 'Taux de participation à la hausse', digits: 0, visibleIf: isCP },
    { kind: 'percent', key: 'cap', label: 'Plafond de remboursement', digits: 0, visibleIf: isCP, hint: '0 % = sans plafond. Ex. 140 % : gain plafonné à +40 %.' },
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
  couponRate: type === 'reverse-convertible' ? 0.075 : type === 'phoenix' ? 0.08 : type === 'capital-protected' ? 0 : 0.09,
  couponBarrier: type === 'phoenix' ? 0.7 : 1,
  memory: true,
  autocallBarrier: 1,
  autocallStepDown: 0,
  firstCallObservation: type === 'phoenix' ? 4 : 1,
  protectionBarrier: type === 'reverse-convertible' ? 0.7 : 0.6,
  barrierType: 'european',
  strike: 1,
  protectionLevel: 1,
  participation: 1,
  cap: 0,
  pathShape: 'linear',
  ...taxDefaults('pfu'),
});

function ScenarioDetail({ scenarios, initialLevel }: { scenarios: ScenarioResult[]; initialLevel: number }) {
  const [idx, setIdx] = useState(Math.min(2, scenarios.length - 1));
  const s = scenarios[Math.min(idx, scenarios.length - 1)];
  return (
    <div className="space-y-3">
      <Card className="p-4 md:p-5">
        <div className="text-[14px] font-semibold tracking-tight mb-3">Tableau chronologique des observations</div>
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

function structuredTaxNote(v: Values) {
  switch (v.taxRegime) {
    case 'pea': return 'PEA : produit supposé éligible (ex. fonds à formule) ; coupons et remboursements restent dans le plan, gain global imposé au retrait à l’échéance du produit.';
    case 'is': return 'IS : coupons et plus-value imposés au taux d’IS (simplification : à la date de versement) ; la moins-value éventuelle, déductible du résultat imposable, n’est pas valorisée.';
    case 'none': return '';
    default: return 'Compte-titres : coupons imposés à leur versement, plus-value au remboursement ; une moins-value est imputable sur les plus-values de même nature (non valorisé ici).';
  }
}

function structuredReport(v: Values, scenarios: ScenarioResult[], pathNote: string) {
  const ref = scenarios.find((s) => s.label === 'Marché stable') ?? scenarios[0];
  const worst = scenarios.reduce((a, b) => (b.totalReceived < a.totalReceived ? b : a));
  const nObs = observationDates(validate(structuredSchema, v)).length;
  const typeLabel = PRODUCT_LABEL[v.productType] ?? v.productType;
  const hasTax = v.taxRegime && v.taxRegime !== 'none';
  const taxed = scenarios.map((s) => {
    const t = resolveTax(v, s.durationYears);
    return { t, ...taxStructuredScenario(s, v.capital, v.observationsPerYear, t.rate, t.exitOnly) };
  });
  const refTax = taxed[scenarios.indexOf(ref)];
  const protectionText = isCP(v)
    ? `À l’échéance : remboursement = capital × max(${pct(v.protectionLevel, 0)} ; 1 + ${pct(v.participation, 0)} × performance${v.cap > 0 ? ` plafonné à ${pct(v.cap, 0)}` : ''}).`
    : `À l’échéance : capital protégé si ${v.barrierType === 'european' ? 'niveau final' : 'la barrière n’a jamais été franchie (approximation aux dates d’observation) ou niveau final ≥ strike'} ≥ ${pct(v.protectionBarrier, 0)} ; sinon remboursement = capital × niveau final / ${pct(v.strike, 0)}.`;
  const couponText = v.productType === 'reverse-convertible' || isCP(v)
    ? (v.couponRate > 0 ? `Coupon fixe de ${pct(v.couponRate)} par an, versé quelle que soit l’évolution du sous-jacent.` : 'Aucun coupon.')
    : `Coupon ${pct(v.couponRate)} par an, barrière de coupon ${pct(v.couponBarrier, 0)}, ${v.memory ? 'avec' : 'sans'} effet mémoire ; rappel si niveau ≥ ${pct(v.autocallBarrier, 0)}${v.autocallStepDown > 0 ? ` (−${pct(v.autocallStepDown, 1)} par observation)` : ''} dès l’observation ${v.firstCallObservation}.`;
  return {
    report: {
      headline: { label: `Total remboursé — ${ref.label.toLowerCase()}`, value: money(ref.totalReceived), tone: ref.capitalLoss ? 'neg' as const : 'pos' as const, sub: `${ref.redeemedEarly ? `Rappel au bout de ${fmtYears(ref.durationYears)}` : `Échéance (${fmtYears(ref.durationYears)})`} · TRI ${pct(ref.annualizedReturn)}${hasTax ? ` · net d’impôt ${money(refTax.netReceived)} (TRI net ${pct(refTax.netIRR)})` : ''}` },
      metrics: scenarios.map((s, k) => ({ label: s.label, value: money(s.totalReceived), tone: s.capitalLoss ? 'neg' as const : s.gain > 0 ? 'pos' as const : undefined, hint: `${s.redeemedEarly ? `rappel ${dateFR(s.redemptionDate)}` : 'échéance'} · coupons ${money(s.totalCoupons)} · TRI ${pct(s.annualizedReturn)}${hasTax ? ` · net ${money(taxed[k].netReceived)} · TRI net ${pct(taxed[k].netIRR)}` : ''}` })),
      tables: [
        hasTax
          ? { title: 'Synthèse par scénario', columns: ['Scénario', 'Fin', 'Durée', 'Coupons', 'Capital', 'Total brut', 'TRI brut', 'Impôt', 'Net', 'TRI net'], rows: scenarios.map((s, k) => [s.label, dateFR(s.redemptionDate), fmtYears(s.durationYears), money(s.totalCoupons), money(s.capitalReturned), money(s.totalReceived), pct(s.annualizedReturn), money(taxed[k].tax), money(taxed[k].netReceived), pct(taxed[k].netIRR)]) }
          : { title: 'Synthèse par scénario', columns: ['Scénario', 'Fin', 'Durée', 'Coupons', 'Capital', 'Total', 'TRI'], rows: scenarios.map((s) => [s.label, dateFR(s.redemptionDate), fmtYears(s.durationYears), money(s.totalCoupons), money(s.capitalReturned), money(s.totalReceived), pct(s.annualizedReturn)]) },
        ...scenarios.map((s) => ({ title: `Observations — ${s.label}`, pdfOnly: true, columns: ['Obs.', 'Date', 'Niveau', 'Coupon', 'Capital', 'Événement'], align: ['left', 'left', 'right', 'right', 'right', 'left'] as ('left' | 'right')[], rows: s.rows.map((r) => [r.index, dateFR(r.date), pct(r.level, 1), money(r.coupon), r.capitalRedeemed ? money(r.capitalRedeemed) : '—', r.event]) })),
      ],
      assumptions: [
        `${typeLabel}${v.underlying ? ` sur ${v.underlying}` : ''} — ${nObs} dates d’observation (${OBS_OPTIONS.find((o) => o.value === v.observationsPerYear)?.label.toLowerCase()}), niveaux en % du niveau initial (${num(v.initialLevel, 2)}).`,
        pathNote,
        couponText,
        protectionText,
        'TRI calculé sur les flux aux dates d’observation (paiement supposé à la date d’observation).',
        ...(hasTax ? [`Fiscalité : ${refTax.t.note}`, structuredTaxNote(v)] : []),
      ],
      warnings: [
        `Les montants s’entendent hors risque de crédit de l’émetteur/garant, hors frais${hasTax ? '' : ', hors fiscalité'}, et pour un produit conservé jusqu’au rappel ou à l’échéance. La valeur de revente en cours de vie peut être très différente.`,
        `Pire scénario présenté : ${worst.label} → ${money(worst.totalReceived)} (${pct(worst.totalReceived / v.capital - 1, 1, true)}).`,
        'Les conditions saisies doivent reprendre exactement la documentation contractuelle (term sheet / KID) du produit.',
      ],
      rules: hasTax ? [...new Set(taxed.flatMap((x) => x.t.ruleIds))] : [],
    },
    chart: <BarSeriesChart title="Montant total perçu par scénario" x="s" stacked data={scenarios.map((s) => ({ s: s.label.replace('Hausse de ', '+').replace('Baisse de ', '−').replace('Marché stable', 'Stable').replace('Trajectoire personnalisée', 'Perso.'), capital: s.capitalReturned, coupons: s.totalCoupons }))} series={[{ key: 'capital', label: 'Capital' }, { key: 'coupons', label: 'Coupons' }]} />,
    extra: <ScenarioDetail scenarios={scenarios} initialLevel={v.initialLevel} />,
  };
}

export const structured = defineSim('structured', {
  description: 'Simulateur unique de produits structurés : Autocall / Athéna, Phoenix, Reverse convertible et capital protégé — coupons, rappel, barrières, protection, scénarios de marché et fiscalité.',
  defaults: () => structuredDefaults('autocall'),
  fields: [
    ...structuredFields(),
    { kind: 'group', label: 'Scénarios de marché' },
    { kind: 'segmented', key: 'pathShape', label: 'Trajectoire du sous-jacent', options: [{ value: 'linear', label: 'Progressive (linéaire)' }, { value: 'immediate', label: 'Choc immédiat' }], hint: 'Progressive : le sous-jacent atteint la performance finale à l’échéance. Choc immédiat : niveau constant dès la 1re observation.' },
    ...taxFields({ pea: true }),
  ],
  compute: (v) => {
    const scenarios = calculateAutocall(v as never, v.pathShape);
    const note = v.pathShape === 'immediate' ? 'Scénarios « choc immédiat » : le sous-jacent est au niveau final dès la première observation et y reste.' : 'Scénarios « progressifs » : le sous-jacent évolue linéairement de 100 % jusqu’au niveau final à la dernière observation (un scénario de hausse est donc rappelé dès que le niveau franchit la barrière).';
    return structuredReport(v, scenarios, note);
  },
  formula: [
    'Autocall : rappel à l’obs. k si S_k ≥ B_rappel(k) → capital + coupon × k (mémoire) ou × 1 ; échéance : S_N ≥ B_coupon → capital + coupons',
    'Phoenix : coupon_k = c/f × (1 + coupons manqués si mémoire) si S_k ≥ B_coupon ; rappel si S_k ≥ B_rappel(k)',
    'Reverse convertible : coupon_k = C × c / f (inconditionnel)',
    'Échéance (barrière) : S_N ≥ B_protection → C ; sinon C × S_N / strike',
    'Capital protégé : C × max(protection ; min(1 + participation × (S_N − 1) ; plafond))',
    'Net : coupons et plus-value × (1 − t) au fil de l’eau, ou gain global × (1 − t) à la sortie (PEA)',
  ],
  example: 'Autocall coupon 10 %/an, rappel à 100 % : un sous-jacent à 90 %, 95 % puis 105 % déclenche un rappel en année 3 avec 30 % de coupons cumulés.',
});

/* ======================= Simulateur de scénarios personnalisés ======================= */
function TrajectoryForm({ values, set }: { values: Values; set: (p: Values) => void }) {
  let dates: string[] = [];
  try { dates = observationDates(validate(structuredSchema, values)); } catch { dates = []; }
  const path: (number | null)[] = Array.from({ length: dates.length }, (_, k) => values.customPath?.[k] ?? 1);
  const preset = (perf: number, shape: 'linear' | 'immediate') => set({ customPath: buildPath(perf, dates.length, shape) });
  const volatile = (seed: number) => {
    try {
      set({ volSeed: seed, customPath: buildVolatilePath(values.volTarget ?? 0, values.volSigma ?? 0.2, dates.length, values.observationsPerYear, seed) });
    } catch { /* saisie incomplète */ }
  };
  return (
    <FormCard title="Trajectoire personnalisée" description="Niveau du sous-jacent à chaque observation, en % du niveau initial.">
      <div className="flex flex-wrap gap-2 mb-3">
        {[-0.5, -0.3, 0, 0.2].map((p) => <Button key={p} size="sm" onClick={() => preset(p, 'linear')}>{p === 0 ? 'Stable' : `${p > 0 ? '+' : '−'}${Math.abs(p * 100)} % linéaire`}</Button>)}
      </div>
      <div className="rounded-xl bg-sunken/60 hairline p-3.5 mb-4 space-y-3">
        <div className="text-[13px] font-semibold">Trajectoire volatile</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1.5 text-[12px] font-medium text-muted"><span>Perte / gain cible à l’échéance</span><NumberInput value={values.volTarget ?? 0} scale={100} suffix="%" allowNegative onChange={(volTarget) => set({ volTarget })} /></label>
          <label className="block space-y-1.5 text-[12px] font-medium text-muted"><span>Volatilité annuelle</span><NumberInput value={values.volSigma ?? 0.2} scale={100} suffix="%" onChange={(volSigma) => set({ volSigma })} /></label>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button size="sm" onClick={() => volatile(values.volSeed ?? 1)}>Générer</Button>
          <Button size="sm" variant="ghost" onClick={() => volatile((values.volSeed ?? 1) + 1)}>Nouveau tirage</Button>
          <span className="text-[11px] text-muted">Tirage n° {values.volSeed ?? 1} · niveau final calé sur la cible</span>
        </div>
      </div>
      {dates.length > 60 ? <p className="text-xs text-neg">Trop d’observations pour une saisie manuelle (max 60).</p> : (
        <div className="grid grid-cols-2 gap-2">
          {dates.map((d, k) => (
            <label key={d} className="block space-y-1.5 text-[12px] font-medium text-muted">
              <span>Obs. {k + 1} · {dateFR(d)}</span>
              <NumberInput value={path[k]} scale={100} suffix="%" onChange={(x) => { const np = [...path]; np[k] = x; set({ customPath: np }); }} />
            </label>
          ))}
        </div>
      )}
    </FormCard>
  );
}

export const scenarios = defineSim('scenarios', {
  description: 'Définissez vous-même le niveau du sous-jacent à chaque date d’observation — ou générez une trajectoire volatile calée sur une perte ou un gain cible — et comparez-la aux scénarios standards.',
  defaults: () => ({ ...structuredDefaults('phoenix'), maturityYears: 5, observationsPerYear: 1, firstCallObservation: 1, customPath: [0.95, 0.82, 0.68, 0.74, 0.88], volTarget: -0.1, volSigma: 0.2, volSeed: 1 }),
  fields: [...structuredFields(), ...taxFields({ pea: true })],
  customForm: (p) => <TrajectoryForm {...p} />,
  compute: (v) => {
    const p = validate(structuredSchema, v);
    const n = observationDates(p).length;
    if (n > 60) throw new ValidationError(['Maximum 60 observations pour le simulateur personnalisé']);
    const path: (number | null)[] = Array.from({ length: n }, (_, k) => v.customPath?.[k] ?? 1);
    if (path.some((x) => x === null)) throw new ValidationError(['Renseignez le niveau de chaque observation']);
    const custom = runStructured(p, path as number[], 'Trajectoire personnalisée');
    const std = STANDARD_SCENARIOS.filter((s) => [0, -0.2, -0.4].includes(s.perf)).map((s) => runStructured(p, buildPath(s.perf, n, 'linear'), s.label));
    const out = structuredReport(v, [custom, ...std], 'Trajectoire personnalisée saisie observation par observation (ou générée : marche aléatoire log-normale calée sur la performance cible par pont brownien), comparée à trois scénarios progressifs standards.');
    const t = resolveTax(v, custom.durationYears);
    const net = taxStructuredScenario(custom, p.capital, p.observationsPerYear, t.rate, t.exitOnly);
    out.report.headline = { label: 'Trajectoire personnalisée — total perçu', value: money(custom.totalReceived), tone: custom.capitalLoss ? 'neg' : 'pos', sub: `${custom.redeemedEarly ? `Rappel le ${dateFR(custom.redemptionDate)}` : `Échéance le ${dateFR(custom.redemptionDate)}`} · TRI ${pct(custom.annualizedReturn)}${v.taxRegime !== 'none' ? ` · net ${money(net.netReceived)} (TRI net ${pct(net.netIRR)})` : ''}` };
    const showCoupon = p.productType === 'autocall' || p.productType === 'phoenix';
    const showProt = p.productType !== 'capital-protected';
    return {
      ...out,
      chart: (
        <div className="space-y-4">
          <LineSeriesChart title="Trajectoire et barrières" x="obs" xLabel={(o) => `Observation ${o}`} valueFormat={(x) => pct(x, 1)} yFormat={(x) => pct(x, 0)} data={path.map((l, k) => ({ obs: k + 1, level: l as number, coupon: showCoupon ? p.couponBarrier : NaN, protection: showProt ? p.protectionBarrier : NaN }))} series={[{ key: 'level', label: 'Sous-jacent' }, ...(showCoupon ? [{ key: 'coupon', label: 'Barrière de coupon' }] : []), ...(showProt ? [{ key: 'protection', label: 'Barrière de protection' }] : [])]} />
          {out.chart}
        </div>
      ),
    };
  },
  formula: ['Moteur identique au simulateur de produits structurés, appliqué à la trajectoire saisie.', 'Trajectoire volatile : X_k = Σ σ·√(1/f)·ε_i, L_k = X_k − (k/N)·X_N + (k/N)·ln(1 + cible), S_k = e^(L_k)'],
  example: 'Phoenix 8 %, barrière 70 %, trajectoire 95 / 82 / 68 / 74 / 88 % : coupons aux observations 1, 2, puis 4 avec rattrapage de l’observation 3.',
});

export const marketSims = [bond, structured, scenarios];
export { cn };

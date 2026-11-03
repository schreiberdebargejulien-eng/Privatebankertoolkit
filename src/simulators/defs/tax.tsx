import {
  calculateIR, calculateIFI, calculateAssuranceVie, calculatePER, calculateDonation, calculateSuccession, calculateDismemberment,
  IR_VERSIONS, PER_VERSIONS, IFI_VERSIONS, DMTG_VERSIONS, DISMEMBERMENT_VERSIONS, CAPITAL_TAX_VERSIONS, RELATIONSHIP_LABELS, pickVersion, todayISO,
} from '@/engine';
import { defineSim } from '../helpers';
import { money, pct, num } from '@/lib/format';
import { BarSeriesChart, DonutChart, LineSeriesChart } from '@/components/charts';
import type { Settings } from '@/lib/settings';

const irVersionDefault = (s: Settings) => (s.irVersion !== 'auto' ? s.irVersion : pickVersion(IR_VERSIONS).meta.id);
const IR_OPTIONS = IR_VERSIONS.map((v) => ({ value: v.meta.id, label: v.meta.label }));
const STATUS_OPTIONS = [{ value: 'single', label: 'Célibataire / divorcé' }, { value: 'couple', label: 'Marié / pacsé' }, { value: 'widowed', label: 'Veuf' }];
const bracketsTable = (lines: { from: number; to: number | null; rate: number; base: number; tax: number }[], title: string) => ({
  title,
  columns: ['Tranche', 'Taux', 'Base', 'Impôt'],
  rows: lines.filter((l) => l.base > 0 || l.rate === 0).map((l) => [`${money(l.from)} – ${l.to === null ? '∞' : money(l.to)}`, pct(l.rate, 1), money(l.base), money(l.tax)]),
});

/* ================================ IR ================================ */
export const ir = defineSim('ir', {
  description: 'Estimation de l’impôt sur le revenu au barème progressif : parts, plafonnement du quotient familial, décote, TMI et CEHR.',
  fiscal: true,
  defaults: (s) => ({ netTaxableIncome: 180_000, status: 'couple', children: 2, alternateCustodyChildren: 0, singleParent: false, versionId: irVersionDefault(s) }),
  fields: [
    { kind: 'select', key: 'versionId', label: 'Barème', options: IR_OPTIONS },
    { kind: 'money', key: 'netTaxableIncome', label: 'Revenu net imposable du foyer', hint: 'Après abattement de 10 % (ou frais réels) et charges déductibles.', slider: { min: 0, max: 600_000, step: 1000 } },
    { kind: 'select', key: 'status', label: 'Situation familiale', options: STATUS_OPTIONS },
    { kind: 'number', key: 'children', label: 'Enfants à charge (exclusive)', integer: true, min: 0 },
    { kind: 'number', key: 'alternateCustodyChildren', label: 'Enfants en résidence alternée', integer: true, min: 0 },
    { kind: 'toggle', key: 'singleParent', label: 'Parent isolé (case T)', hint: 'Personne vivant seule avec enfant(s) à charge.', visibleIf: (v) => v.status === 'single' },
  ],
  compute: (v) => {
    const r = calculateIR(v as never);
    return {
      report: {
        headline: { label: 'Impôt estimé', value: money(r.totalTax), sub: `TMI ${pct(r.marginalRate, 0)} · taux moyen ${pct(r.averageRate)} · ${num(r.parts, 2)} parts` },
        metrics: [
          { label: 'Nombre de parts', value: num(r.parts, 2) },
          { label: 'Quotient familial', value: money(r.quotient) },
          { label: 'Impôt brut (avant plafonnement)', value: money(r.taxBeforeCap) },
          { label: 'Avantage du quotient familial', value: money(r.qfAdvantage), hint: r.qfCapped ? `plafonné à ${money(r.qfCap)}` : `plafond ${money(r.qfCap)}` },
          ...(r.qfCapped ? [{ label: 'Plafonnement du QF appliqué', value: `+ ${money(r.qfAdvantage - r.qfCap)}`, tone: 'neg' as const }] : []),
          ...(r.decote > 0 ? [{ label: 'Décote', value: `− ${money(r.decote)}`, tone: 'pos' as const }] : []),
          { label: 'Impôt sur le revenu net', value: money(r.netIncomeTax) },
          ...(r.cehr > 0 ? [{ label: 'CEHR', value: money(r.cehr) }] : []),
          { label: 'Taux marginal d’imposition', value: pct(r.marginalRate, 0), tone: 'accent' },
          { label: 'Taux moyen', value: pct(r.averageRate) },
        ],
        tables: [bracketsTable(r.bracketLines, r.qfCapped ? 'Barème appliqué (parts de référence, plafonnement)' : 'Détail par tranche')],
        assumptions: [
          'Revenu saisi = revenu net imposable global soumis au barème.',
          'Réductions et crédits d’impôt, revenus au PFU, prélèvements sociaux non inclus.',
          'Impôt arrondi à l’euro le plus proche.',
        ],
        warnings: r.warnings,
        rules: [r.versionId],
      },
      chart: <BarSeriesChart title="Impôt par tranche" x="t" data={r.bracketLines.filter((l) => l.base > 0).map((l) => ({ t: pct(l.rate, 0), tax: l.tax }))} series={[{ key: 'tax', label: 'Impôt' }]} />,
    };
  },
  formula: ['Impôt = N × Barème(R / N)', 'Avantage QF ≤ demi-parts supplémentaires × plafond', 'Décote = forfait − 45,25 % × impôt (si impôt < forfait / 45,25 %)'],
  example: 'Barème 2025 : couple, 2 enfants, 60 000 € → impôt brut 2 806 €, décote 200 €, impôt 2 606 €.',
});

/* ================================ IFI ================================ */
export const ifi = defineSim('ifi', {
  description: 'Estimation de l’IFI : abattement sur la résidence principale, dettes déductibles et leur limitation, décote, barème et plafonnement.',
  fiscal: true,
  defaults: () => ({ realEstateAssets: 2_400_000, mainResidenceValue: 1_800_000, deductibleDebts: 600_000, applyCap: false, previousYearIncome: 250_000, previousYearIncomeTaxes: 80_000 }),
  fields: [
    { kind: 'group', label: 'Patrimoine immobilier au 1er janvier' },
    { kind: 'money', key: 'mainResidenceValue', label: 'Résidence principale (valeur vénale)', hint: 'Abattement de 30 % appliqué automatiquement.' },
    { kind: 'money', key: 'realEstateAssets', label: 'Autres actifs immobiliers taxables', hint: 'Immobilier locatif, résidences secondaires, SCPI/SCI (quote-part immobilière), terrains…' },
    { kind: 'money', key: 'deductibleDebts', label: 'Dettes déductibles', hint: 'Dettes afférentes aux actifs taxables existant au 1er janvier.' },
    { kind: 'group', label: 'Plafonnement' },
    { kind: 'toggle', key: 'applyCap', label: 'Calculer le plafonnement (75 % des revenus)' },
    { kind: 'money', key: 'previousYearIncome', label: 'Revenus de l’année précédente', visibleIf: (v) => v.applyCap },
    { kind: 'money', key: 'previousYearIncomeTaxes', label: 'IR et prélèvements sociaux dus sur ces revenus', visibleIf: (v) => v.applyCap },
  ],
  compute: (v) => {
    const r = calculateIFI(v as never);
    return {
      report: {
        headline: { label: 'IFI estimé', value: money(r.ifi), sub: r.taxable ? `Patrimoine net taxable : ${money(r.netAssets)} · taux effectif ${pct(r.effectiveRate, 3)}` : `Patrimoine net taxable : ${money(r.netAssets)} — sous le seuil` },
        metrics: [
          { label: 'Actif brut taxable', value: money(r.grossAssets) },
          { label: 'Abattement résidence principale (30 %)', value: `− ${money(r.rpAllowance)}`, tone: 'pos' },
          { label: 'Dettes déduites', value: `− ${money(r.deductibleDebts)}`, hint: r.debtLimited ? 'limitation art. 974 II appliquée' : undefined },
          { label: 'Patrimoine net taxable', value: money(r.netAssets) },
          { label: 'IFI selon barème', value: money(r.scaleTax) },
          ...(r.decote > 0 ? [{ label: 'Décote', value: `− ${money(r.decote)}`, tone: 'pos' as const }] : []),
          ...(r.capReduction > 0 ? [{ label: 'Réduction au titre du plafonnement', value: `− ${money(r.capReduction)}`, tone: 'pos' as const }] : []),
          { label: 'Taux marginal', value: pct(r.marginalRate, 2) },
        ],
        tables: [bracketsTable(r.bracketLines, 'Barème IFI')],
        assumptions: ['Évaluation au 1er janvier de l’année d’imposition.', 'Le barème s’applique dès 800 000 € une fois le seuil de 1,3 M€ atteint.', 'Réductions IFI-dons non intégrées.'],
        warnings: r.warnings,
        rules: [r.versionId],
      },
    };
  },
  formula: ['Base = Immo + RP × 70 % − dettes', 'Si 1,3 M€ ≤ Base ≤ 1,4 M€ : décote = 17 500 − 1,25 % × Base', 'Plafonnement : réduction = max(0, IR + PS + IFI − 75 % revenus)'],
  example: 'Patrimoine net taxable de 2 M€ → IFI de 7 400 €.',
});

/* ============================ Assurance-vie ============================ */
export const assuranceVie = defineSim('assurance-vie', {
  description: 'Fiscalité d’un rachat partiel ou total : quote-part de gains, ancienneté, abattement, primes avant/après le 27/09/2017, PFU ou barème.',
  fiscal: true,
  defaults: () => ({
    subscriptionDate: '2012-03-15', withdrawalDate: todayISO(), contractValue: 850_000, withdrawalAmount: 100_000,
    premiumsBefore2017: 300_000, premiumsAfter2017: 250_000, otherContractsPremiumsBefore2017: 0, otherContractsPremiumsAfter2017: 0,
    household: 'couple', allowanceAlreadyUsed: 0, progressiveOption: false, marginalRate: 0.41, socialAlreadyPaidShare: 0,
  }),
  fields: [
    { kind: 'group', label: 'Contrat' },
    { kind: 'date', key: 'subscriptionDate', label: 'Date de souscription (date d’effet)' },
    { kind: 'date', key: 'withdrawalDate', label: 'Date du rachat' },
    { kind: 'money', key: 'contractValue', label: 'Valeur du contrat avant rachat' },
    { kind: 'money', key: 'withdrawalAmount', label: 'Montant du rachat' },
    { kind: 'group', label: 'Primes versées (nettes de rachats)' },
    { kind: 'money', key: 'premiumsBefore2017', label: 'Primes versées avant le 27/09/2017' },
    { kind: 'money', key: 'premiumsAfter2017', label: 'Primes versées depuis le 27/09/2017' },
    { kind: 'money', key: 'otherContractsPremiumsBefore2017', label: 'Autres contrats — primes avant 27/09/2017', hint: 'Pour le seuil de 150 000 € (par assuré, tous contrats).' },
    { kind: 'money', key: 'otherContractsPremiumsAfter2017', label: 'Autres contrats — primes depuis 27/09/2017' },
    { kind: 'group', label: 'Foyer et options' },
    { kind: 'segmented', key: 'household', label: 'Abattement annuel (> 8 ans)', options: [{ value: 'single', label: 'Personne seule 4 600 €' }, { value: 'couple', label: 'Couple 9 200 €' }] },
    { kind: 'money', key: 'allowanceAlreadyUsed', label: 'Abattement déjà utilisé cette année' },
    { kind: 'toggle', key: 'progressiveOption', label: 'Option pour le barème progressif', hint: 'Option globale annuelle — approximée au taux marginal.' },
    { kind: 'percent', key: 'marginalRate', label: 'Taux marginal (TMI)', visibleIf: (v) => v.progressiveOption, digits: 0 },
    { kind: 'percent', key: 'socialAlreadyPaidShare', label: 'Part des gains déjà soumise aux PS', hint: 'Fonds euros : PS prélevés chaque année sur les intérêts.' },
  ],
  compute: (v) => {
    const r = calculateAssuranceVie(v as never);
    return {
      report: {
        headline: { label: 'Montant net perçu', value: money(r.net), sub: `Fiscalité totale ${money(r.totalTax)} (${pct(r.effectiveRate)} du rachat) · contrat de ${r.years} ans` },
        metrics: [
          { label: 'Quote-part de capital', value: money(r.capitalInWithdrawal) },
          { label: 'Quote-part de produits', value: money(r.gainInWithdrawal) },
          { label: 'Plus-value latente totale du contrat', value: money(r.totalGain) },
          { label: 'Ancienneté', value: `${r.years} ans ${r.over8 ? '(≥ 8 ans)' : '(< 8 ans)'}` },
          ...(r.over8 ? [{ label: 'Abattement utilisé', value: `${money(r.allowanceUsed)} / ${money(r.allowanceAvailable)}`, tone: 'pos' as const }] : []),
          { label: 'Impôt sur le revenu', value: money(r.incomeTax), tone: 'neg' },
          { label: `Prélèvements sociaux (${pct(r.socialRate, 1)})`, value: money(r.socialTax), tone: 'neg' },
        ],
        tables: [{ title: 'Détail de l’imposition des produits', columns: ['Fraction', 'Base', 'Taux', 'Impôt'], align: ['left', 'right', 'right', 'right'], rows: r.lines.map((l) => [l.label, money(l.base), pct(l.rate, 1), money(l.tax)]) }],
        assumptions: [
          'Produits du rachat = rachat × (valeur − primes) / valeur.',
          'Ventilation des produits entre primes antérieures et postérieures au 27/09/2017 au prorata des primes.',
          'Abattement imputé en priorité sur les produits des primes antérieures au 27/09/2017.',
          'Imposition finale estimée (après régularisation déclarative), et non le prélèvement à la source.',
        ],
        warnings: r.warnings,
        rules: [r.versionId],
      },
      chart: <DonutChart title="Décomposition du rachat" data={[{ label: 'Capital', value: r.capitalInWithdrawal }, { label: 'Produits nets', value: Math.max(0, r.gainInWithdrawal - r.totalTax) }, { label: 'Impôt sur le revenu', value: r.incomeTax }, { label: 'Prélèvements sociaux', value: r.socialTax }]} />,
    };
  },
  formula: ['Produits = R × (V − P) / V', '≥ 8 ans : (produits − abattement) × 7,5 % (ou 12,8 % au-delà de 150 000 € de primes)', '< 8 ans : 12,8 % (primes post-2017), 35 % / 15 % (PFL, primes antérieures)', 'PS = produits × 17,2 %'],
  example: 'Rachat de 40 000 € sur un contrat de 200 000 € (150 000 € de primes), 16 ans : produits 10 000 €, IR 405 €, PS 1 720 €.',
});

/* ================================ PER ================================ */
export const per = defineSim('per', {
  description: 'Économie d’impôt immédiate (calcul exact au barème), capital constitué et comparaison sortie en capital / en rente.',
  fiscal: true,
  defaults: (s) => ({
    netTaxableIncome: 160_000, status: 'couple', children: 1, contribution: 20_000, capMode: 'notice', availableCap: 37_680, professionalIncome: 150_000,
    annualContribution: 20_000, years: 15, annualRate: 0.045, annualFee: 0.007, retirementMarginalRate: 0.3, ageAtAnnuity: 64, annuityConversionRate: 0.045,
    wrapper: 'insurance', irVersionId: irVersionDefault(s), perVersionId: pickVersion(PER_VERSIONS).meta.id,
  }),
  fields: [
    { kind: 'group', label: 'Situation fiscale' },
    { kind: 'select', key: 'irVersionId', label: 'Barème IR', options: IR_OPTIONS },
    { kind: 'money', key: 'netTaxableIncome', label: 'Revenu net imposable du foyer' },
    { kind: 'select', key: 'status', label: 'Situation familiale', options: STATUS_OPTIONS },
    { kind: 'number', key: 'children', label: 'Enfants à charge', integer: true },
    { kind: 'group', label: 'Versement' },
    { kind: 'money', key: 'contribution', label: 'Versement volontaire cette année' },
    { kind: 'segmented', key: 'capMode', label: 'Plafond de déduction', options: [{ value: 'notice', label: 'Avis d’imposition' }, { value: 'estimate', label: 'Estimer' }] },
    { kind: 'money', key: 'availableCap', label: 'Plafond disponible (avis d’imposition)', visibleIf: (v) => v.capMode === 'notice' },
    { kind: 'select', key: 'perVersionId', label: 'Millésime du plafond', options: PER_VERSIONS.map((x) => ({ value: x.meta.id, label: x.meta.label })), visibleIf: (v) => v.capMode === 'estimate' },
    { kind: 'money', key: 'professionalIncome', label: 'Revenus d’activité N-1 (nets de frais)', visibleIf: (v) => v.capMode === 'estimate' },
    { kind: 'group', label: 'Phase d’épargne' },
    { kind: 'money', key: 'annualContribution', label: 'Versements annuels futurs' },
    { kind: 'number', key: 'years', label: 'Années jusqu’à la retraite', unit: 'ans', integer: true, slider: { min: 1, max: 40, step: 1 } },
    { kind: 'percent', key: 'annualRate', label: 'Rendement annuel brut' },
    { kind: 'percent', key: 'annualFee', label: 'Frais annuels' },
    { kind: 'segmented', key: 'wrapper', label: 'Type de PER', options: [{ value: 'insurance', label: 'Assurantiel' }, { value: 'banking', label: 'Bancaire' }] },
    { kind: 'group', label: 'Sortie' },
    { kind: 'percent', key: 'retirementMarginalRate', label: 'TMI estimée à la retraite', digits: 0 },
    { kind: 'number', key: 'ageAtAnnuity', label: 'Âge au premier versement de rente', unit: 'ans', integer: true },
    { kind: 'percent', key: 'annuityConversionRate', label: 'Taux de conversion en rente', hint: 'Rente annuelle brute / capital — selon l’assureur.' },
  ],
  compute: (v) => {
    const r = calculatePER(v as never);
    return {
      report: {
        headline: { label: 'Économie d’impôt immédiate', value: money(r.taxSaving), tone: 'pos', sub: `Coût réel du versement : ${money(r.effectiveCost)} · TMI ${pct(r.marginalRate, 0)}` },
        metrics: [
          { label: 'Plafond de déduction', value: money(r.cap) },
          { label: 'Montant déductible', value: money(r.deductible) },
          { label: 'IR avant versement', value: money(r.irBefore) },
          { label: 'IR après versement', value: money(r.irAfter) },
          { label: 'Taux d’économie effectif', value: pct(r.savingRate, 1) },
          { label: `Capital estimé dans ${v.years} ans`, value: money(r.capital), tone: 'accent' },
          { label: 'Sortie en capital — net', value: money(r.capitalExit.net), hint: `IR ${money(r.capitalExit.incomeTax)} · PS ${money(r.capitalExit.social)}` },
          { label: 'Sortie en rente — net annuel', value: money(r.annuityExit.net), hint: `soit ${money(r.annuityExit.monthlyNet)} / mois · brut ${money(r.annuityExit.gross)}` },
        ],
        tables: [{ title: 'Projection du capital', columns: ['Année', 'Versements', 'Capital'], rows: r.schedule.map((y) => [y.year, money(y.contributed), money(y.value)]) }],
        assumptions: [
          'Économie d’impôt = IR(revenu) − IR(revenu − versement déductible), calculée au barème.',
          'Sortie en capital : versements déduits imposés au barème (TMI saisie, sans abattement de 10 %) ; plus-values au PFU 12,8 % + PS.',
          `Sortie en rente : rente imposée comme une pension (abattement 10 %) ; PS sur la fraction imposable des RVTO (${pct(r.annuityExit.rvtoFraction, 0)}).`,
          `PS sur les gains : ${pct(r.socialRateGains, 1)} (${v.wrapper === 'insurance' ? 'PER assurantiel' : 'PER bancaire'}).`,
        ],
        warnings: r.warnings,
        rules: r.versionIds,
      },
      chart: <LineSeriesChart title="Capital constitué" area x="year" data={r.schedule.map((y) => ({ year: y.year, value: y.value, contributed: y.contributed }))} series={[{ key: 'value', label: 'Capital' }, { key: 'contributed', label: 'Versements' }]} />,
    };
  },
  formula: ['Plafond = max(10 % × min(revenus pro ; 8 PASS) ; 10 % PASS)', 'Économie = IR(R) − IR(R − min(versement ; plafond))', 'Capital net = C − versements × TMI − PV × (12,8 % + PS)'],
  example: 'Célibataire à 100 000 € (barème 2026) : versement de 10 000 € → IR de 24 801 € à 20 701 €, économie de 4 100 €.',
});

/* ============================== Donation ============================== */
const REL_OPTIONS = Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => ({ value, label }));
export const donation = defineSim('donation', {
  description: 'Droits de donation : abattements, rappel fiscal des 15 ans, don familial de sommes d’argent, donation en nue-propriété.',
  fiscal: true,
  defaults: () => ({ amount: 300_000, relationship: 'child', donorAge: 68, doneeAge: 38, priorGifts: 0, ownership: 'full', familyCashGift: true, familyCashGiftAlreadyUsed: 0, donorHasNoDescendant: false, doneeDisabled: false, priorDisabilityGifts: 0 }),
  fields: [
    { kind: 'group', label: 'Donation' },
    { kind: 'money', key: 'amount', label: 'Montant transmis (pleine propriété)' },
    { kind: 'select', key: 'relationship', label: 'Lien de parenté donateur → donataire', options: REL_OPTIONS },
    { kind: 'number', key: 'donorAge', label: 'Âge du donateur', unit: 'ans', integer: true },
    { kind: 'number', key: 'doneeAge', label: 'Âge du donataire', unit: 'ans', integer: true },
    { kind: 'segmented', key: 'ownership', label: 'Droit transmis', options: [{ value: 'full', label: 'Pleine propriété' }, { value: 'bare', label: 'Nue-propriété' }] },
    { kind: 'group', label: 'Historique et exonérations' },
    { kind: 'money', key: 'priorGifts', label: 'Donations antérieures < 15 ans (même bénéficiaire)', hint: 'Valeur fiscale des donations taxables rappelées (hors dons familiaux exonérés).' },
    { kind: 'toggle', key: 'familyCashGift', label: 'Don familial de sommes d’argent (art. 790 G)', hint: 'Donateur < 80 ans, donataire majeur, numéraire.' },
    { kind: 'money', key: 'familyCashGiftAlreadyUsed', label: 'Don familial déjà utilisé (< 15 ans)', visibleIf: (v) => v.familyCashGift },
    { kind: 'toggle', key: 'donorHasNoDescendant', label: 'Donateur sans descendance', visibleIf: (v) => v.familyCashGift && v.relationship === 'nephew' },
    { kind: 'toggle', key: 'doneeDisabled', label: 'Donataire en situation de handicap', hint: 'Abattement supplémentaire de 159 325 €.' },
  ],
  compute: (v) => {
    const r = calculateDonation(v as never);
    return {
      report: {
        headline: { label: 'Droits de donation estimés', value: money(r.duties), sub: `Net transmis ${money(r.netReceived)} · taux moyen ${pct(r.averageRate, 1)} · TMI ${pct(r.marginalRate, 0)}` },
        metrics: [
          ...(v.ownership === 'bare' ? [{ label: `Valeur de la nue-propriété (${pct(1 - r.usufructRate, 0)})`, value: money(r.taxableValue) }] : []),
          ...(r.familyExemption > 0 ? [{ label: 'Don familial exonéré', value: `− ${money(r.familyExemption)}`, tone: 'pos' as const }] : []),
          ...(r.disabilityAllowanceUsed > 0 ? [{ label: 'Abattement handicap', value: `− ${money(r.disabilityAllowanceUsed)}`, tone: 'pos' as const }] : []),
          { label: 'Abattement personnel', value: money(r.allowance) },
          { label: 'Abattement disponible', value: money(r.allowanceLeft) },
          { label: 'Abattement utilisé', value: `− ${money(r.allowanceUsed)}`, tone: 'pos' },
          { label: 'Base taxable', value: money(r.taxableBase) },
          { label: 'Droits', value: money(r.duties), tone: 'neg' },
        ],
        tables: r.lines.length ? [{ title: 'Calcul par tranche', columns: ['Tranche', 'Taux', 'Base', 'Droits'], rows: r.lines.map((l) => [`${money(l.from)} – ${l.to === null ? '∞' : money(l.to)}`, pct(l.rate, 0), money(l.base), money(l.tax)]) }] : [],
        assumptions: [
          `Barème applicable : ${RELATIONSHIP_LABELS[v.relationship as keyof typeof RELATIONSHIP_LABELS]}.`,
          'Rappel fiscal : les donations de moins de 15 ans consomment l’abattement puis les tranches basses du barème.',
          ...(v.ownership === 'bare' ? [`Nue-propriété évaluée selon l’art. 669 CGI (donateur de ${v.donorAge} ans).`] : []),
        ],
        warnings: r.warnings,
        rules: [r.versionId, ...(v.ownership === 'bare' ? [pickVersion(DISMEMBERMENT_VERSIONS).meta.id] : [])],
      },
    };
  },
  formula: ['Base = valeur − don familial − abattements disponibles', 'Droits = Barème(base antérieure + base) − Barème(base antérieure)'],
  example: 'Parent → enfant, 200 000 € sans donation antérieure : base 100 000 €, droits 18 194 €.',
});

/* ============================== Succession ============================== */
export const succession = defineSim('succession', {
  description: 'Liquidation du régime matrimonial, dévolution légale (réserve, quotité disponible, droits du conjoint) et droits par héritier.',
  fiscal: true,
  defaults: () => ({ regime: 'community', ownAssets: 800_000, commonAssets: 3_000_000, liabilities: 150_000, spouseAlive: true, spouseAge: 72, spouseOption: 'usufruct', children: 3, allChildrenCommon: true, priorGiftsPerChild: 0, parentsAlive: 0, siblings: 0, siblingsExempt: false }),
  fields: [
    { kind: 'group', label: 'Patrimoine du défunt' },
    { kind: 'select', key: 'regime', label: 'Régime matrimonial', options: [{ value: 'community', label: 'Communauté (légale ou conventionnelle)' }, { value: 'separation', label: 'Séparation de biens' }, { value: 'universal', label: 'Communauté universelle — attribution intégrale' }] },
    { kind: 'money', key: 'ownAssets', label: 'Biens propres / personnels du défunt' },
    { kind: 'money', key: 'commonAssets', label: 'Biens communs ou indivis (totalité)', hint: 'La moitié revient au conjoint (liquidation).' },
    { kind: 'money', key: 'liabilities', label: 'Passif successoral', hint: 'Dettes du défunt, frais funéraires (dans la limite de 1 500 €)…' },
    { kind: 'group', label: 'Héritiers' },
    { kind: 'toggle', key: 'spouseAlive', label: 'Conjoint survivant (marié)' },
    { kind: 'number', key: 'spouseAge', label: 'Âge du conjoint', unit: 'ans', integer: true, visibleIf: (v) => v.spouseAlive },
    { kind: 'number', key: 'children', label: 'Nombre d’enfants', integer: true },
    { kind: 'toggle', key: 'allChildrenCommon', label: 'Tous les enfants sont communs', visibleIf: (v) => v.spouseAlive && v.children > 0 },
    { kind: 'segmented', key: 'spouseOption', label: 'Option du conjoint', options: [{ value: 'usufruct', label: 'Usufruit total' }, { value: 'quarter', label: '1/4 pleine propriété' }], visibleIf: (v) => v.spouseAlive && v.children > 0 && v.allChildrenCommon },
    { kind: 'money', key: 'priorGiftsPerChild', label: 'Donations < 15 ans par enfant', visibleIf: (v) => v.children > 0 },
    { kind: 'number', key: 'parentsAlive', label: 'Parents du défunt vivants', integer: true, visibleIf: (v) => v.children === 0 },
    { kind: 'number', key: 'siblings', label: 'Frères et sœurs', integer: true, visibleIf: (v) => v.children === 0 && !v.spouseAlive },
    { kind: 'toggle', key: 'siblingsExempt', label: 'Frères/sœurs remplissant les conditions d’exonération', visibleIf: (v) => v.children === 0 && !v.spouseAlive && v.siblings > 0 },
  ],
  compute: (v) => {
    const r = calculateSuccession(v as never);
    return {
      report: {
        headline: { label: 'Droits de succession estimés', value: money(r.totalDuties), sub: `Actif net ${money(r.netEstate)} · taux moyen ${pct(r.averageRate, 1)} · net transmis ${money(r.netTransmitted)}` },
        metrics: [
          ...(r.communityShare > 0 ? [{ label: 'Quote-part de communauté / indivision', value: money(r.communityShare) }] : []),
          { label: 'Actif brut successoral', value: money(r.grossEstate) },
          { label: 'Actif net successoral', value: money(r.netEstate) },
          ...(v.children > 0 ? [
            { label: `Réserve héréditaire (${pct(r.reserveRate, 0)})`, value: money(r.reserve) },
            { label: 'Quotité disponible', value: money(r.available) },
          ] : []),
          ...(r.usufruct > 0 ? [{ label: 'Valeur fiscale de l’usufruit du conjoint', value: pct(r.usufruct, 0) }] : []),
        ],
        tables: [{ title: 'Droits par héritier', columns: ['Héritier', 'Droits reçus', 'Valeur', 'Abattement', 'Droits', 'Net'], align: ['left', 'left', 'right', 'right', 'right', 'right'], rows: r.heirs.map((h) => [h.label, h.rights, money(h.value), h.relationship === 'spouse' ? 'Exonéré' : money(h.allowance), money(h.duties), money(h.net)]) }],
        assumptions: ['Dévolution légale, sans testament ni donation au dernier vivant.', 'Nue-propriété des enfants valorisée selon l’art. 669 CGI à l’âge du conjoint.', 'Conjoint survivant exonéré (art. 796-0 bis CGI).'],
        warnings: r.warnings,
        rules: [pickVersion(DMTG_VERSIONS).meta.id, pickVersion(DISMEMBERMENT_VERSIONS).meta.id],
      },
      chart: r.heirs.length > 0 ? <BarSeriesChart title="Valeur reçue et droits par héritier" x="h" stacked data={r.heirs.map((h) => ({ h: h.label.replace('Conjoint survivant', 'Conjoint'), net: h.net, duties: h.duties }))} series={[{ key: 'net', label: 'Net reçu' }, { key: 'duties', label: 'Droits' }]} /> : undefined,
    };
  },
  formula: ['Actif net = biens propres + ½ communauté − passif', 'NP enfant = actif net × (1 − usufruit 669) / n', 'Droits = Barème(part − abattement résiduel)'],
  example: 'Communauté de 2 M€, conjoint de 75 ans (usufruit 30 %), 2 enfants : 350 000 € de nue-propriété chacun, 48 194 € de droits par enfant.',
});

/* ============================== Démembrement ============================== */
export const demembrement = defineSim('demembrement', {
  description: 'Valeur fiscale de l’usufruit et de la nue-propriété (barème de l’art. 669 CGI), et économie de droits d’une donation de la nue-propriété.',
  fiscal: true,
  defaults: () => ({ value: 1_500_000, mode: 'life', usufructuaryAge: 66, durationYears: 10, children: 2, priorGifts: 0 }),
  fields: [
    { kind: 'money', key: 'value', label: 'Valeur du bien en pleine propriété' },
    { kind: 'segmented', key: 'mode', label: 'Usufruit', options: [{ value: 'life', label: 'Viager' }, { value: 'temporary', label: 'Temporaire' }] },
    { kind: 'number', key: 'usufructuaryAge', label: 'Âge de l’usufruitier', unit: 'ans', integer: true, visibleIf: (v) => v.mode === 'life', slider: { min: 18, max: 100, step: 1 } },
    { kind: 'number', key: 'durationYears', label: 'Durée de l’usufruit', unit: 'ans', integer: true, visibleIf: (v) => v.mode === 'temporary' },
    { kind: 'group', label: 'Simulation de transmission aux enfants', visibleIf: (v) => v.mode === 'life' },
    { kind: 'number', key: 'children', label: 'Nombre d’enfants donataires', integer: true, visibleIf: (v) => v.mode === 'life' },
    { kind: 'money', key: 'priorGifts', label: 'Donations antérieures < 15 ans par enfant', visibleIf: (v) => v.mode === 'life' },
  ],
  compute: (v) => {
    const r = calculateDismemberment(v as never);
    let extraMetrics: { label: string; value: string; tone?: 'pos' | 'neg' }[] = [];
    const warnings: string[] = [...r.notes];
    if (v.mode === 'life' && v.children > 0) {
      const share = v.value / v.children;
      const npDon = calculateDonation({ amount: share, relationship: 'child', donorAge: Math.max(18, v.usufructuaryAge), doneeAge: 30, ownership: 'bare', priorGifts: v.priorGifts });
      const ppDon = calculateDonation({ amount: share, relationship: 'child', donorAge: Math.max(18, v.usufructuaryAge), doneeAge: 30, ownership: 'full', priorGifts: v.priorGifts });
      extraMetrics = [
        { label: 'Droits — donation NP (total enfants)', value: money(npDon.duties * v.children) },
        { label: 'Droits — donation PP (total enfants)', value: money(ppDon.duties * v.children) },
        { label: 'Économie de droits', value: money((ppDon.duties - npDon.duties) * v.children), tone: 'pos' },
      ];
      warnings.push('Au décès de l’usufruitier, l’usufruit s’éteint sans droits de succession (art. 1133 CGI), sous réserve de l’art. 751 CGI (présomption de fictivité) et de l’abus de droit.');
    }
    return {
      report: {
        headline: { label: 'Valeur de la nue-propriété', value: money(r.bareOwnershipValue), sub: `Usufruit ${pct(r.usufructRate, 0)} · nue-propriété ${pct(r.bareOwnershipRate, 0)}` },
        metrics: [
          { label: 'Valeur de l’usufruit', value: money(r.usufructValue) },
          { label: 'Valeur de la nue-propriété', value: money(r.bareOwnershipValue) },
          ...extraMetrics,
        ],
        tables: [{ title: 'Barème de l’article 669 CGI', columns: ['Âge de l’usufruitier', 'Usufruit', 'Nue-propriété'], rows: r.scale.map((s, k, arr) => [k === 0 ? `Moins de ${s.maxAgeExclusive} ans` : k === arr.length - 1 ? `${arr[k - 1].maxAgeExclusive} ans et plus` : `${arr[k - 1].maxAgeExclusive} à ${s.maxAgeExclusive - 1} ans`, pct(s.usufruct, 0), pct(1 - s.usufruct, 0)]) }],
        assumptions: ['Barème fiscal (et non économique) : il s’impose pour les droits d’enregistrement et l’IFI.', 'Âge apprécié au jour de la transmission.'],
        warnings,
        rules: [pickVersion(DISMEMBERMENT_VERSIONS).meta.id, ...(v.mode === 'life' && v.children > 0 ? [pickVersion(DMTG_VERSIONS).meta.id] : [])],
      },
      chart: <DonutChart title="Répartition de la valeur" data={[{ label: 'Usufruit', value: r.usufructValue }, { label: 'Nue-propriété', value: r.bareOwnershipValue }]} />,
    };
  },
  formula: ['US = valeur × taux(âge) ; NP = valeur − US', 'Usufruit temporaire = 23 % par période de 10 ans'],
  example: 'Usufruitier de 66 ans : usufruit 40 %, nue-propriété 60 %.',
});

export const taxSims = [ir, ifi, assuranceVie, per, donation, succession, demembrement];
export { IFI_VERSIONS, CAPITAL_TAX_VERSIONS };

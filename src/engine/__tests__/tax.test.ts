import { describe, expect, it } from 'vitest';
import { calculateIR, computeParts } from '../tax/fr/ir';
import { calculateIFI } from '../tax/fr/ifi';
import { calculateDonation, calculateDismemberment, computeDuties } from '../tax/fr/dmtg';
import { calculateAssuranceVie } from '../tax/fr/assuranceVie';
import { calculatePER, computePERCap } from '../tax/fr/per';
import { calculateSuccession } from '../tax/fr/succession';
import { DMTG_VERSIONS, IR_VERSIONS, pickVersion } from '../tax/fr/rules';
import { safeCalc } from '../core/errors';

const IR25 = 'FR-IR-2025';
const IR26 = 'FR-IR-2026';

describe('Registre des règles', () => {
  it('sélection par date d’effet', () => {
    expect(pickVersion(IR_VERSIONS, '2025-06-01').meta.id).toBe(IR25);
    expect(pickVersion(IR_VERSIONS, '2026-03-01').meta.id).toBe(IR26);
  });
  it('chaque règle a une source et une date de vérification', () => {
    for (const v of [...IR_VERSIONS, ...DMTG_VERSIONS]) {
      expect(v.meta.sources.length).toBeGreaterThan(0);
      expect(v.meta.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('Quotient familial', () => {
  it('nombre de parts', () => {
    expect(computeParts('couple', 3, 0, false).parts).toBe(4);
    expect(computeParts('couple', 2, 0, false).parts).toBe(3);
    expect(computeParts('single', 1, 0, true).parts).toBe(2);
    expect(computeParts('single', 0, 1, false).parts).toBe(1.25);
    expect(computeParts('couple', 2, 1, false).parts).toBe(3.5);
    expect(computeParts('widowed', 1, 0, false).parts).toBe(2.5);
  });
});

describe('Impôt sur le revenu (barème 2025, revenus 2024) — calculs de référence manuels', () => {
  it('célibataire, 30 000 € : 2 165 €', () => {
    const r = calculateIR({ netTaxableIncome: 30_000, status: 'single', children: 0, versionId: IR25 });
    expect(r.netIncomeTax).toBe(2165);
    expect(r.marginalRate).toBe(0.3);
    expect(r.decote).toBe(0);
  });
  it('célibataire, 100 000 € : 24 945 €', () => {
    expect(calculateIR({ netTaxableIncome: 100_000, status: 'single', children: 0, versionId: IR25 }).netIncomeTax).toBe(24_945);
  });
  it('couple 2 enfants, 60 000 € : impôt brut 2 805,99 € puis décote → 2 606 €', () => {
    const r = calculateIR({ netTaxableIncome: 60_000, status: 'couple', children: 2, versionId: IR25 });
    expect(r.parts).toBe(3);
    expect(r.taxAfterCap).toBeCloseTo(2805.99, 2);
    expect(r.decote).toBeCloseTo(1470 - 0.4525 * 2805.99, 1);
    expect(r.netIncomeTax).toBe(2606);
  });
  it('plafonnement du QF : couple 2 enfants, 200 000 € → 46 308 €', () => {
    const r = calculateIR({ netTaxableIncome: 200_000, status: 'couple', children: 2, versionId: IR25 });
    expect(r.qfCapped).toBe(true);
    expect(r.qfCap).toBe(3582);
    expect(r.netIncomeTax).toBe(46_308);
    expect(r.marginalRate).toBe(0.41);
  });
  it('parent isolé 1 enfant, 80 000 € : plafond spécifique 4 224 € → 12 941 €', () => {
    const r = calculateIR({ netTaxableIncome: 80_000, status: 'single', children: 1, singleParent: true, versionId: IR25 });
    expect(r.qfCapped).toBe(true);
    expect(r.netIncomeTax).toBe(12_941);
  });
  it('revenu nul', () => {
    expect(calculateIR({ netTaxableIncome: 0, status: 'single', children: 0 }).netIncomeTax).toBe(0);
  });
  it('barème 2026 : célibataire 100 000 € → 24 801 €', () => {
    expect(calculateIR({ netTaxableIncome: 100_000, status: 'single', children: 0, versionId: IR26 }).netIncomeTax).toBe(24_801);
  });
  it('CEHR : célibataire 600 000 € → 3 % × 250 000 + 4 % × 100 000 = 11 500 €', () => {
    expect(calculateIR({ netTaxableIncome: 600_000, status: 'single', children: 0, versionId: IR26 }).cehr).toBe(11_500);
  });
  it('revenu négatif refusé', () => {
    expect(safeCalc(() => calculateIR({ netTaxableIncome: -1, status: 'single', children: 0 })).ok).toBe(false);
  });
});

describe('IFI', () => {
  it('patrimoine net 2 000 000 € → 7 400 €', () => {
    expect(calculateIFI({ realEstateAssets: 2_000_000, mainResidenceValue: 0, deductibleDebts: 0 }).ifi).toBe(7400);
  });
  it('décote : 1 350 000 € → 2 850 − 625 = 2 225 €', () => {
    const r = calculateIFI({ realEstateAssets: 1_350_000, mainResidenceValue: 0, deductibleDebts: 0 });
    expect(r.decote).toBeCloseTo(625, 6);
    expect(r.ifi).toBe(2225);
  });
  it('abattement 30 % sur la résidence principale', () => {
    const r = calculateIFI({ realEstateAssets: 1_000_000, mainResidenceValue: 1_000_000, deductibleDebts: 0 });
    expect(r.netAssets).toBe(1_700_000);
    expect(r.ifi).toBe(5300);
  });
  it('sous le seuil de 1,3 M€ : pas d’IFI', () => {
    expect(calculateIFI({ realEstateAssets: 1_299_999, mainResidenceValue: 0, deductibleDebts: 0 }).ifi).toBe(0);
  });
  it('limitation des dettes > 60 % pour un actif > 5 M€', () => {
    const r = calculateIFI({ realEstateAssets: 10_000_000, mainResidenceValue: 0, deductibleDebts: 7_000_000 });
    expect(r.deductibleDebts).toBe(6_500_000);
    expect(r.ifi).toBe(20_690);
  });
  it('plafonnement à 75 % des revenus', () => {
    const r = calculateIFI({ realEstateAssets: 5_000_000, mainResidenceValue: 0, deductibleDebts: 0, applyCap: true, previousYearIncome: 50_000, previousYearIncomeTaxes: 30_000 });
    // IFI brut : 2 500 + 8 890 + 24 300 = 35 690 ; limite 37 500 ; excès = 30 000 + 35 690 − 37 500 = 28 190
    expect(r.capReduction).toBeCloseTo(28_190, 6);
    expect(r.ifi).toBe(7500);
  });
});

describe('Donations', () => {
  it('enfant, 200 000 € : base 100 000 € → 18 194 €', () => {
    const r = calculateDonation({ amount: 200_000, relationship: 'child', donorAge: 60, doneeAge: 30 });
    expect(r.taxableBase).toBe(100_000);
    expect(r.duties).toBe(18_194);
  });
  it('don familial de sommes d’argent cumulé', () => {
    const r = calculateDonation({ amount: 231_865, relationship: 'child', donorAge: 70, doneeAge: 30, familyCashGift: true });
    expect(r.familyExemption).toBe(31_865);
    expect(r.duties).toBe(18_194);
    expect(calculateDonation({ amount: 131_865, relationship: 'child', donorAge: 70, doneeAge: 30, familyCashGift: true }).duties).toBe(0);
  });
  it('don familial refusé si donateur ≥ 80 ans', () => {
    const r = calculateDonation({ amount: 131_865, relationship: 'child', donorAge: 80, doneeAge: 30, familyCashGift: true });
    expect(r.familyEligible).toBe(false);
    expect(r.familyExemption).toBe(0);
  });
  it('rappel fiscal : 60 000 € déjà donnés, nouvelle donation 100 000 € → 10 194 €', () => {
    expect(calculateDonation({ amount: 100_000, relationship: 'child', donorAge: 60, doneeAge: 30, priorGifts: 60_000 }).duties).toBe(10_194);
  });
  it('rappel fiscal : tranches consommées (150 000 € antérieurs, + 50 000 €) → 10 000 €', () => {
    expect(calculateDonation({ amount: 50_000, relationship: 'child', donorAge: 60, doneeAge: 30, priorGifts: 150_000 }).duties).toBe(10_000);
  });
  it('neveu 50 000 € → 55 % après 7 967 € = 23 118 €', () => {
    expect(calculateDonation({ amount: 50_000, relationship: 'nephew', donorAge: 60, doneeAge: 30 }).duties).toBe(23_118);
  });
  it('frère 50 000 € → 12 888 €', () => {
    expect(calculateDonation({ amount: 50_000, relationship: 'sibling', donorAge: 60, doneeAge: 50 }).duties).toBe(12_888);
  });
  it('nue-propriété, donateur 65 ans : 60 % de 500 000 € → 38 194 €', () => {
    const r = calculateDonation({ amount: 500_000, relationship: 'child', donorAge: 65, doneeAge: 35, ownership: 'bare' });
    expect(r.taxableValue).toBe(300_000);
    expect(r.duties).toBe(38_194);
  });
  it('computeDuties sans base imposable', () => {
    const d = computeDuties(50_000, 100_000, pickVersion(DMTG_VERSIONS).params.scales.directLine);
    expect(d.duties).toBe(0);
  });
});

describe('Démembrement (art. 669)', () => {
  it.each([[20, 0.9], [21, 0.8], [40, 0.7], [61, 0.4], [70, 0.4], [71, 0.3], [91, 0.1]])('usufruitier %i ans → %f', (age, u) => {
    expect(calculateDismemberment({ value: 100, mode: 'life', usufructuaryAge: age }).usufructRate).toBe(u);
  });
  it('usufruit temporaire 15 ans → 2 × 23 % = 46 %', () => {
    expect(calculateDismemberment({ value: 100, mode: 'temporary', durationYears: 15 }).usufructRate).toBeCloseTo(0.46, 10);
  });
});

describe('Assurance-vie — rachat partiel', () => {
  it('contrat > 8 ans, primes avant/après 2017, ≤ 150 000 €', () => {
    const r = calculateAssuranceVie({
      subscriptionDate: '2010-01-01', withdrawalDate: '2026-06-01', contractValue: 200_000, withdrawalAmount: 40_000,
      premiumsBefore2017: 100_000, premiumsAfter2017: 50_000, household: 'single',
    });
    expect(r.gainInWithdrawal).toBeCloseTo(10_000, 6);
    expect(r.allowanceUsed).toBeCloseTo(4600, 6);
    expect(r.incomeTax).toBeCloseTo((6666.667 - 4600) * 0.075 + 3333.333 * 0.075, 2);
    expect(r.socialTax).toBeCloseTo(1720, 6);
    expect(r.net).toBeCloseTo(40_000 - 405 - 1720, 2);
  });
  it('contrat < 8 ans, primes post-2017 : PFU 12,8 %', () => {
    const r = calculateAssuranceVie({
      subscriptionDate: '2022-01-01', withdrawalDate: '2026-01-01', contractValue: 120_000, withdrawalAmount: 12_000,
      premiumsBefore2017: 0, premiumsAfter2017: 100_000, household: 'couple',
    });
    expect(r.allowanceAvailable).toBe(0);
    expect(r.incomeTax).toBeCloseTo(256, 6);
    expect(r.net).toBeCloseTo(11_400, 6);
  });
  it('primes > 150 000 € : fraction à 7,5 % = (150 000 − primes avant 2017) / primes après', () => {
    const r = calculateAssuranceVie({
      subscriptionDate: '2015-01-01', withdrawalDate: '2026-06-01', contractValue: 250_000, withdrawalAmount: 50_000,
      premiumsBefore2017: 100_000, premiumsAfter2017: 100_000, household: 'single',
    });
    expect(r.incomeTax).toBeCloseTo(400 * 0.075 + 2500 * 0.075 + 2500 * 0.128, 6);
  });
  it('contrat en moins-value : aucun impôt', () => {
    const r = calculateAssuranceVie({ subscriptionDate: '2015-01-01', withdrawalDate: '2026-06-01', contractValue: 90_000, withdrawalAmount: 10_000, premiumsBefore2017: 0, premiumsAfter2017: 100_000, household: 'single' });
    expect(r.totalTax).toBe(0);
  });
  it('rachat > valeur refusé', () => {
    expect(safeCalc(() => calculateAssuranceVie({ subscriptionDate: '2015-01-01', withdrawalDate: '2026-06-01', contractValue: 10, withdrawalAmount: 20, premiumsBefore2017: 0, premiumsAfter2017: 10, household: 'single' })).ok).toBe(false);
  });
});

describe('PER', () => {
  it('économie d’impôt exacte via le barème : 10 000 € à TMI 41 % → 4 100 €', () => {
    const r = calculatePER({
      netTaxableIncome: 100_000, status: 'single', children: 0, contribution: 10_000, capMode: 'notice', availableCap: 30_000,
      years: 10, annualRate: 0.03, retirementMarginalRate: 0.3, ageAtAnnuity: 65, annuityConversionRate: 0.045, irVersionId: 'FR-IR-2026',
    });
    expect(r.irBefore).toBe(24_801);
    expect(r.irAfter).toBe(20_701);
    expect(r.taxSaving).toBe(4100);
  });
  it('plafond estimé (PASS 2025 = 47 100 €)', () => {
    expect(computePERCap(50_000, 'FR-PER-2026')).toBe(5000);
    expect(computePERCap(0, 'FR-PER-2026')).toBeCloseTo(4710, 6);
    expect(computePERCap(1_000_000, 'FR-PER-2026')).toBeCloseTo(37_680, 6);
  });
});

describe('Succession', () => {
  it('conjoint (75 ans, usufruit 30 %) + 2 enfants, communauté 2 M€ → 48 194 € par enfant', () => {
    const r = calculateSuccession({ regime: 'community', ownAssets: 0, commonAssets: 2_000_000, liabilities: 0, spouseAlive: true, spouseAge: 75, spouseOption: 'usufruct', children: 2 });
    expect(r.netEstate).toBe(1_000_000);
    expect(r.heirs[0].duties).toBe(0);
    expect(r.heirs[1].value).toBeCloseTo(350_000, 6);
    expect(r.heirs[1].duties).toBe(48_194);
    expect(r.totalDuties).toBe(96_388);
  });
  it('option 1/4 en pleine propriété', () => {
    const r = calculateSuccession({ regime: 'community', ownAssets: 0, commonAssets: 2_000_000, liabilities: 0, spouseAlive: true, spouseAge: 75, spouseOption: 'quarter', children: 2 });
    expect(r.heirs[1].value).toBe(375_000);
    expect(r.heirs[1].duties).toBe(53_194);
  });
  it('enfant unique, 1 M€ → 212 962 €', () => {
    const r = calculateSuccession({ regime: 'separation', ownAssets: 1_000_000, commonAssets: 0, liabilities: 0, spouseAlive: false, children: 1 });
    expect(r.heirs[0].duties).toBe(212_962);
    expect(r.reserveRate).toBe(0.5);
  });
  it('communauté universelle avec attribution intégrale : rien au 1er décès', () => {
    const r = calculateSuccession({ regime: 'universal', ownAssets: 0, commonAssets: 2_000_000, liabilities: 0, spouseAlive: true, children: 2 });
    expect(r.netEstate).toBe(0);
    expect(r.totalDuties).toBe(0);
  });
  it('sans conjoint ni enfant : 2 parents + 2 frères', () => {
    const r = calculateSuccession({ regime: 'separation', ownAssets: 400_000, commonAssets: 0, liabilities: 0, spouseAlive: false, children: 0, parentsAlive: 2, siblings: 2 });
    expect(r.heirs.map((h) => h.share)).toEqual([0.25, 0.25, 0.25, 0.25]);
    // Frère : 100 000 − 15 932 = 84 068 → 24 430 × 35 % + 59 638 × 45 %
    expect(r.heirs[2].duties).toBe(Math.round(24_430 * 0.35 + 59_638 * 0.45));
  });
});

import { describe, expect, it } from 'vitest';
import { round, annuityFactor, applyBrackets } from '../core/math';
import { addMonths, days30360, parseISO, toISO } from '../core/dates';
import { calculateCompoundInterest, simulateInvestment } from '../finance/investment';
import { calculateCAGR, calculatePresentValue, calculateXIRR } from '../finance/xirr';
import { calculateNetYield, comparePlacements } from '../finance/netYield';
import { safeCalc } from '../core/errors';

describe('core', () => {
  it('arrondi commercial robuste', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(-2.5, 0)).toBe(-3);
    expect(round(2.675, 2)).toBe(2.68);
  });
  it('facteur d’annuité', () => {
    expect(annuityFactor(0, 10)).toBeCloseTo(0.1, 12);
    expect(annuityFactor(0.01, 12) * 1000).toBeCloseTo(88.85, 2);
  });
  it('barème par tranches', () => {
    const r = applyBrackets(150, [{ from: 0, to: 100, rate: 0.1 }, { from: 100, to: null, rate: 0.2 }]);
    expect(r.tax).toBeCloseTo(20, 10);
    expect(r.marginalRate).toBe(0.2);
  });
  it('dates : fin de mois et 30/360', () => {
    expect(toISO(addMonths(parseISO('2024-01-31'), 1))).toBe('2024-02-29');
    expect(days30360(parseISO('2008-02-15'), parseISO('2008-05-15'))).toBe(90);
  });
});

describe('Intérêts composés', () => {
  const base = { initial: 10_000, contribution: 0, contributionFrequency: 12 as const, contributionTiming: 'end' as const, years: 10, taxMode: 'none' as const, taxRate: 0 };
  it('capitalisation annuelle : 10 000 € à 5 % sur 10 ans = 16 288,95 €', () => {
    const r = calculateCompoundInterest({ ...base, nominalRate: 0.05, compounding: 1 });
    expect(r.finalValueNet).toBeCloseTo(16_288.95, 2);
    expect(r.interest).toBeCloseTo(6_288.95, 2);
  });
  it('capitalisation mensuelle : 10 000 × (1 + 5 %/12)^120 = 16 470,09 €', () => {
    const r = calculateCompoundInterest({ ...base, nominalRate: 0.05, compounding: 12 });
    expect(r.finalValueNet).toBeCloseTo(16_470.09, 2);
    expect(r.effectiveRate).toBeCloseTo(0.0511619, 6);
  });
  it('versements mensuels 100 € à 6 % nominal mensuel sur 10 ans = 16 387,93 € (FV d’annuité)', () => {
    const r = calculateCompoundInterest({ ...base, initial: 0, contribution: 100, nominalRate: 0.06, compounding: 12 });
    expect(r.finalValueNet).toBeCloseTo(16_387.93, 2);
    expect(r.totalContributed).toBe(12_000);
    expect(r.netIRR).toBeCloseTo(Math.pow(1.005, 12) - 1, 8);
  });
  it('fiscalité à la sortie 30 % sur la plus-value', () => {
    const r = calculateCompoundInterest({ ...base, nominalRate: 0.05, compounding: 1, taxMode: 'exit', taxRate: 0.3 });
    expect(r.finalValueNet).toBeCloseTo(10_000 + 6_288.946 * 0.7, 2);
  });
  it('fiscalité annuelle : équivaut à capitaliser au taux net r × (1 − t)', () => {
    const r = calculateCompoundInterest({ ...base, nominalRate: 0.05, compounding: 1, taxMode: 'annual', taxRate: 0.3 });
    expect(r.finalValueNet).toBeCloseTo(10_000 * Math.pow(1.035, 10), 6);
  });
  it('taux nul', () => {
    const r = simulateInvestment({ initial: 1000, contribution: 100, contributionFrequency: 12, contributionTiming: 'start', years: 2, annualRate: 0 });
    expect(r.finalValueNet).toBeCloseTo(3400, 10);
    expect(r.netIRR).toBeCloseTo(0, 8);
  });
  it('refuse une saisie vide', () => {
    const r = safeCalc(() => simulateInvestment({ initial: 0, contribution: 0, contributionFrequency: 12, contributionTiming: 'end', years: 5, annualRate: 0.03 }));
    expect(r.ok).toBe(false);
  });
});

describe('TRI / XIRR', () => {
  it('exemple de référence Excel TRI.PAIEMENTS = 37,3362535 %', () => {
    const r = calculateXIRR({ flows: [
      { date: '2008-01-01', amount: -10_000 },
      { date: '2008-03-01', amount: 2_750 },
      { date: '2008-10-30', amount: 4_250 },
      { date: '2009-02-15', amount: 3_250 },
      { date: '2009-04-01', amount: 2_750 },
    ] });
    expect(r.irr).toBeCloseTo(0.373362535, 8);
  });
  it('placement simple : −100 puis +110 un an (365 j) après = 10 %', () => {
    const r = calculateXIRR({ flows: [{ date: '2023-01-01', amount: -100 }, { date: '2024-01-01', amount: 110 }] });
    expect(r.irr).toBeCloseTo(0.1, 9);
  });
  it('TRI négatif', () => {
    const r = calculateXIRR({ flows: [{ date: '2021-01-01', amount: -1000 }, { date: '2023-01-01', amount: 500 }] });
    expect(r.irr).toBeLessThan(0);
    expect(r.irr).toBeCloseTo(Math.pow(0.5, 365 / 730) - 1, 6);
  });
  it('flux tous positifs refusés', () => {
    expect(safeCalc(() => calculateXIRR({ flows: [{ date: '2021-01-01', amount: 10 }, { date: '2022-01-01', amount: 10 }] })).ok).toBe(false);
  });
  it('flux non triés acceptés', () => {
    const r = calculateXIRR({ flows: [{ date: '2024-01-01', amount: 110 }, { date: '2023-01-01', amount: -100 }] });
    expect(r.irr).toBeCloseTo(0.1, 9);
  });
});

describe('CAGR et actualisation', () => {
  it('doublement en 10 ans = 7,1773 %', () => {
    expect(calculateCAGR({ initialValue: 100, finalValue: 200, years: 10 }).cagr).toBeCloseTo(0.0717735, 6);
  });
  it('valeur finale nulle = −100 %', () => {
    expect(calculateCAGR({ initialValue: 100, finalValue: 0, years: 3 }).cagr).toBe(-1);
  });
  it('VA de 1 000 € à 5 % sur 10 ans = 613,91 €', () => {
    expect(calculatePresentValue({ futureValue: 1000, rate: 0.05, years: 10 }).presentValue).toBeCloseTo(613.91, 2);
  });
});

describe('Rendement net et comparateur', () => {
  it('frais de gestion 1 % sur un rendement de 4 % : 100 000 × (1,04 × 0,99)^10', () => {
    const r = calculateNetYield({ capital: 100_000, grossRate: 0.04, annualFee: 0.01, entryFee: 0, taxMode: 'none', taxRate: 0, years: 10 });
    expect(r.netFinal).toBeCloseTo(133_870.64, 2);
    expect(r.netAnnual).toBeCloseTo(0.0296, 8);
  });
  it('comparateur : le placement sans frais domine', () => {
    const r = comparePlacements({ initial: 100_000, monthlyContribution: 0, years: 10, placements: [
      { label: 'A', grossRate: 0.05, annualFee: 0, entryFee: 0, taxMode: 'none', taxRate: 0 },
      { label: 'B', grossRate: 0.05, annualFee: 0.01, entryFee: 0, taxMode: 'none', taxRate: 0 },
    ] });
    expect(r.bestLabel).toBe('A');
    expect(r.results[0].finalValueNet).toBeCloseTo(162_889.46, 2);
  });
});

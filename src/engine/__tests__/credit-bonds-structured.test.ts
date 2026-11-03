import { describe, expect, it } from 'vitest';
import { calculateAmortization, calculateInFine, calculateLoanCapacity } from '../credit/loans';
import { calculateLombard, calculatePledge } from '../credit/lombard';
import { calculateBondYield } from '../bonds/bond';
import { buildPath, calculateAutocall, runStructured, type StructuredInput } from '../structured/structured';
import { calculateAllocation, calculateComplementaryIncome, calculatePatrimonialProjection, calculateWithdrawalPlan, compareCapitalisationDistribution } from '../wealth/wealth';

describe('Crédit amortissable', () => {
  const r = calculateAmortization({ principal: 200_000, annualRate: 0.035, years: 20 });
  it('mensualité 200 000 € / 3,5 % / 20 ans = 1 159,92 €', () => expect(r.payment).toBeCloseTo(1159.92, 2));
  it('coût des intérêts = 78 380,66 €', () => expect(r.totalInterest).toBeCloseTo(78_380.66, 1));
  it('solde nul à l’échéance', () => expect(r.rows[r.rows.length - 1].balance).toBeCloseTo(0, 6));
  it('TAEG = taux actuariel sans frais ni assurance', () => expect(r.taeg).toBeCloseTo(Math.pow(1 + 0.035 / 12, 12) - 1, 6));
  it('taux nul', () => expect(calculateAmortization({ principal: 12_000, annualRate: 0, years: 1 }).payment).toBeCloseTo(1000, 10));
  it('assurance sur capital initial', () => {
    const a = calculateAmortization({ principal: 200_000, annualRate: 0.035, years: 20, insuranceRate: 0.003 });
    expect(a.monthlyInsurance).toBeCloseTo(50, 10);
    expect(a.totalInsurance).toBeCloseTo(12_000, 6);
  });
});

describe('Capacité d’emprunt', () => {
  it('6 000 € × 35 %, 3,5 %, 25 ans → 419 476,85 €', () => {
    expect(calculateLoanCapacity({ monthlyIncome: 6000, existingCharges: 0, targetDebtRatio: 0.35, annualRate: 0.035, years: 25 }).capacity).toBeCloseTo(419_476.85, 1);
  });
  it('charges excessives → capacité nulle', () => {
    expect(calculateLoanCapacity({ monthlyIncome: 3000, existingCharges: 2000, targetDebtRatio: 0.35, annualRate: 0.035, years: 25 }).capacity).toBe(0);
  });
});

describe('Crédit in fine', () => {
  it('500 000 € à 4 % sur 10 ans, mensuel', () => {
    const r = calculateInFine({ principal: 500_000, annualRate: 0.04, years: 10, frequency: 12 });
    expect(r.periodicInterest).toBeCloseTo(1666.67, 2);
    expect(r.totalInterest).toBeCloseTo(200_000, 6);
  });
});

describe('Lombard', () => {
  const base = {
    assets: [
      { label: 'Actions', value: 1_000_000, advanceRate: 0.6, sensitivity: 1 },
      { label: 'Obligations', value: 500_000, advanceRate: 0.8, sensitivity: 0.3 },
    ],
    loanAmount: 600_000, annualRate: 0.04, years: 3, alertThreshold: 0.9, marginCallThreshold: 1, liquidationThreshold: 1.1,
  };
  const r = calculateLombard(base);
  it('valeur de prêt et LTV', () => {
    expect(r.lendingValue).toBeCloseTo(1_000_000, 6);
    expect(r.initialLTV).toBeCloseTo(0.4, 10);
    expect(r.initialUsage).toBeCloseTo(0.6, 10);
  });
  it('baisse maximale avant appel de marge = 400 000 / 720 000', () => {
    expect(r.maxShockBeforeMarginCall).toBeCloseTo(400_000 / 720_000, 10);
    expect(r.maxShockBeforeAlert).toBeCloseTo((1_000_000 - 600_000 / 0.9) / 720_000, 10);
  });
  it('scénario −40 % : actions 600 000, obligations 440 000', () => {
    const s = r.scenarios.find((x) => x.shock === 0.4)!;
    expect(s.marketValue).toBeCloseTo(1_040_000, 6);
    expect(s.lendingValue).toBeCloseTo(360_000 + 352_000, 6);
  });
  it('nantissement : ratio de couverture', () => {
    const p = calculatePledge({ assets: [{ label: 'A', value: 100_000, haircut: 0.1 }, { label: 'B', value: 50_000, haircut: 0.5 }], exposure: 100_000 });
    expect(p.eligible).toBe(115_000);
    expect(p.coverageRatio).toBeCloseTo(1.15, 10);
  });
});

describe('Obligations (références Excel PRICE / YIELD, base 30/360)', () => {
  it('PRICE(15/02/2008 ; 15/11/2017 ; 5,75 % ; 6,5 % ; 100 ; 2 ; 0) = 94,63436', () => {
    const r = calculateBondYield({ nominal: 100, couponRate: 0.0575, frequency: 2, settlementDate: '2008-02-15', maturityDate: '2017-11-15', dayCount: '30/360', mode: 'yield-to-price', yieldRate: 0.065 });
    expect(r.cleanPrice).toBeCloseTo(94.63436, 4);
  });
  it('YIELD(15/02/2008 ; 15/11/2016 ; 5,75 % ; 95,04287 ; 100 ; 2 ; 0) = 6,5 %', () => {
    const r = calculateBondYield({ nominal: 100, couponRate: 0.0575, frequency: 2, settlementDate: '2008-02-15', maturityDate: '2016-11-15', dayCount: '30/360', mode: 'price-to-yield', cleanPrice: 95.04287 });
    expect(r.yieldToMaturity).toBeCloseTo(0.065, 6);
  });
  it('obligation au pair à une date de coupon : rendement = coupon, coupon couru nul', () => {
    const r = calculateBondYield({ nominal: 10_000, couponRate: 0.05, frequency: 1, settlementDate: '2025-06-30', maturityDate: '2030-06-30', dayCount: 'ACT/ACT', mode: 'price-to-yield', cleanPrice: 100 });
    expect(r.accruedInterest).toBeCloseTo(0, 10);
    expect(r.yieldToMaturity).toBeCloseTo(0.05, 8);
    expect(r.currentYield).toBeCloseTo(0.05, 10);
    expect(r.macaulayDuration).toBeCloseTo(4.5460, 3);
  });
  it('coupon couru ACT/ACT à mi-période', () => {
    const r = calculateBondYield({ nominal: 100, couponRate: 0.04, frequency: 1, settlementDate: '2025-07-02', maturityDate: '2028-01-01', dayCount: 'ACT/ACT', mode: 'price-to-yield', cleanPrice: 100 });
    expect(r.accruedInterest).toBeCloseTo((4 * 182) / 365, 8);
  });
  it('échéance passée refusée', () => {
    expect(() => calculateBondYield({ nominal: 100, couponRate: 0.04, frequency: 1, settlementDate: '2025-07-02', maturityDate: '2024-01-01', dayCount: 'ACT/ACT', mode: 'price-to-yield', cleanPrice: 100 })).toThrow();
  });
});

describe('Produits structurés', () => {
  const phoenix: StructuredInput = {
    productType: 'phoenix', capital: 100_000, issueDate: '2026-01-15', maturityYears: 5, observationsPerYear: 1,
    couponRate: 0.08, couponBarrier: 0.7, memory: true, autocallBarrier: 1, protectionBarrier: 0.6,
  };
  it('Phoenix — marché stable : rappel à la 1re observation, TRI 8 %', () => {
    const r = runStructured(phoenix, [1, 1, 1, 1, 1]);
    expect(r.redeemedEarly).toBe(true);
    expect(r.totalReceived).toBe(108_000);
    expect(r.annualizedReturn).toBeCloseTo(0.08, 8);
  });
  it('Phoenix — baisse linéaire de 50 % : 3 coupons puis perte en capital', () => {
    const r = runStructured(phoenix, buildPath(-0.5, 5, 'linear'));
    expect(r.totalCoupons).toBeCloseTo(24_000, 6);
    expect(r.capitalReturned).toBeCloseTo(50_000, 6);
    expect(r.capitalLoss).toBe(true);
  });
  it('Phoenix — effet mémoire', () => {
    const r = runStructured(phoenix, [0.65, 0.65, 0.8, 0.9, 0.95]);
    expect(r.rows[2].coupon).toBeCloseTo(24_000, 6);
    expect(r.totalCoupons).toBeCloseTo(40_000, 6);
    expect(r.capitalReturned).toBe(100_000);
  });
  it('Phoenix — sans mémoire', () => {
    const r = runStructured({ ...phoenix, memory: false }, [0.65, 0.65, 0.8, 0.9, 0.95]);
    expect(r.totalCoupons).toBeCloseTo(24_000, 6);
  });
  const athena: StructuredInput = {
    productType: 'autocall', capital: 100_000, issueDate: '2026-01-15', maturityYears: 3, observationsPerYear: 1,
    couponRate: 0.1, couponBarrier: 1, memory: true, autocallBarrier: 1, protectionBarrier: 0.6,
  };
  it('Autocall — rappel en année 3 avec coupons cumulés', () => {
    const r = runStructured(athena, [0.9, 0.95, 1.05]);
    expect(r.totalCoupons).toBeCloseTo(30_000, 6);
    expect(r.capitalReturned).toBe(100_000);
  });
  it('Autocall — barrière dégressive', () => {
    const r = runStructured({ ...athena, autocallStepDown: 0.05 }, [0.9, 0.95, 1.05]);
    expect(r.rows.length).toBe(2);
    expect(r.totalCoupons).toBeCloseTo(20_000, 6);
  });
  it('Autocall — échéance sous barrière de coupon mais au-dessus de la protection', () => {
    const r = runStructured(athena, [0.8, 0.75, 0.7]);
    expect(r.totalCoupons).toBe(0);
    expect(r.capitalReturned).toBe(100_000);
  });
  it('Reverse convertible — barrière européenne', () => {
    const rc: StructuredInput = { productType: 'reverse-convertible', capital: 100_000, issueDate: '2026-01-15', maturityYears: 1, observationsPerYear: 4, couponRate: 0.07, couponBarrier: 0, memory: false, autocallBarrier: 2, protectionBarrier: 0.7 };
    const ok = runStructured(rc, buildPath(-0.2, 4, 'linear'));
    expect(ok.totalCoupons).toBeCloseTo(7000, 6);
    expect(ok.capitalReturned).toBe(100_000);
    const ko = runStructured(rc, buildPath(-0.4, 4, 'linear'));
    expect(ko.capitalReturned).toBeCloseTo(60_000, 6);
    const am = runStructured({ ...rc, barrierType: 'american' }, [0.65, 0.9, 0.95, 0.98]);
    expect(am.capitalReturned).toBeCloseTo(98_000, 6);
  });
  it('8 scénarios standards', () => {
    expect(calculateAutocall(phoenix).length).toBe(8);
  });
  it('trajectoire de longueur incorrecte refusée', () => {
    expect(() => runStructured(phoenix, [1, 1])).toThrow();
  });
});

describe('Patrimoine', () => {
  it('projection : 100 000 € à 5 % sur 10 ans', () => {
    const r = calculatePatrimonialProjection({ financialAssets: 100_000, realEstate: 0, debt: 0, debtRate: 0, debtYears: 0, annualSavings: 0, financialReturn: 0.05, realEstateGrowth: 0, inflation: 0.02, years: 10 });
    expect(r.finalNet).toBeCloseTo(162_889.46, 2);
    expect(r.finalReal).toBeCloseTo(162_889.46 / Math.pow(1.02, 10), 2);
  });
  it('projection : dette amortie à zéro à son terme', () => {
    const r = calculatePatrimonialProjection({ financialAssets: 0, realEstate: 500_000, debt: 200_000, debtRate: 0.03, debtYears: 10, annualSavings: 0, financialReturn: 0, realEstateGrowth: 0, inflation: 0, years: 15 });
    expect(r.rows[10].debt).toBeCloseTo(0, 6);
    expect(r.rows[5].debt).toBeGreaterThan(0);
  });
  it('allocation : poids', () => {
    const r = calculateAllocation({ lines: [{ label: 'Actions', amount: 600 }, { label: 'Obligations', amount: 400 }] });
    expect(r.lines[0].weight).toBeCloseTo(0.6, 12);
  });
  it('rente : 100 000 € à 0 %, 1 000 €/mois → épuisement en 100 mois', () => {
    const r = calculateWithdrawalPlan({ capital: 100_000, annualReturn: 0, monthlyWithdrawal: 1000, inflation: 0, indexWithdrawals: false, horizonYears: 10 });
    expect(r.depletionMonths).toBe(100);
    expect(r.sustainableMonthly).toBeCloseTo(833.33, 1);
  });
  it('rente perpétuelle si retrait < rendement', () => {
    const r = calculateWithdrawalPlan({ capital: 1_000_000, annualReturn: 0.05, monthlyWithdrawal: 2000, inflation: 0, indexWithdrawals: false, horizonYears: 20 });
    expect(r.depletionMonths).toBeNull();
  });
  it('revenus complémentaires', () => {
    const r = calculateComplementaryIncome({ capital: 1_000_000, totalReturn: 0.05, distributionRate: 0.04, taxRate: 0.3, years: 10 });
    expect(r.netAnnual).toBeCloseTo(28_000, 6);
    expect(r.netMonthly).toBeCloseTo(2333.33, 2);
  });
  it('capitalisation = distribution sans fiscalité (réinvestissement)', () => {
    const r = compareCapitalisationDistribution({ capital: 100_000, totalReturn: 0.05, distributionRate: 0.03, distributionTax: 0, exitTax: 0, reinvest: true, years: 10 });
    expect(r.difference).toBeCloseTo(0, 6);
  });
  it('capitalisation avantageuse avec fiscalité annuelle', () => {
    const r = compareCapitalisationDistribution({ capital: 100_000, totalReturn: 0.05, distributionRate: 0.03, distributionTax: 0.314, exitTax: 0.314, reinvest: true, years: 10 });
    expect(r.difference).toBeGreaterThan(0);
  });
});

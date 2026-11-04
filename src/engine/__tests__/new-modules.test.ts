import { describe, expect, it } from 'vitest';
import {
  resolveInvestmentTax, calculateTermDeposit, calculateGuarantee, buildVolatilePath, runStructured, taxStructuredScenario, buildPath,
  type StructuredInput,
} from '../index';

const D = '2026-06-01';

describe('Fiscalité des placements', () => {
  it('PFU 2026 = 12,8 % + 18,6 %', () => {
    expect(resolveInvestmentTax({ regime: 'pfu', date: D }).rate).toBeCloseTo(0.314, 10);
  });
  it('PFU 2025 = 30 %', () => {
    expect(resolveInvestmentTax({ regime: 'pfu', date: '2025-06-01' }).rate).toBeCloseTo(0.3, 10);
  });
  it('barème : TMI 30 % + PS 18,6 % − 30 % × 6,8 %', () => {
    expect(resolveInvestmentTax({ regime: 'bareme', tmi: 0.3, date: D }).rate).toBeCloseTo(0.3 + 0.186 - 0.0204, 10);
  });
  it('PEA : PFU avant 5 ans, PS seuls après', () => {
    expect(resolveInvestmentTax({ regime: 'pea', holdingYears: 4, date: D }).rate).toBeCloseTo(0.314, 10);
    const after = resolveInvestmentTax({ regime: 'pea', holdingYears: 3, peaAgeYears: 2, date: D });
    expect(after.rate).toBeCloseTo(0.186, 10);
    expect(after.exitOnly).toBe(true);
  });
  it('IS : 25 % ou 15 %, sans PS', () => {
    expect(resolveInvestmentTax({ regime: 'is' }).rate).toBe(0.25);
    expect(resolveInvestmentTax({ regime: 'is', isRate: 'reduced' }).rate).toBe(0.15);
  });
});

describe('Compte à terme', () => {
  const base = { capital: 100_000, months: 12, annualRate: 0.03, taxRegime: 'pfu' as const, date: D };
  it('12 mois à 3 % : 3 000 € bruts, 2 058 € nets au PFU 2026', () => {
    const r = calculateTermDeposit(base);
    expect(r.grossInterest).toBeCloseTo(3000, 6);
    expect(r.netInterest).toBeCloseTo(2058, 6);
    expect(r.grossIRR).toBeCloseTo(0.03, 8);
    expect(r.netIRR).toBeCloseTo(0.02058, 8);
  });
  it('progressif sur 3 ans, intérêts à l’échéance', () => {
    const r = calculateTermDeposit({ ...base, months: 36, rateMode: 'progressive', stepUp: 0.005, taxRegime: 'none' });
    expect(r.grossInterest).toBeCloseTo(100_000 * (0.03 + 0.035 + 0.04), 6);
    expect(r.grossIRR).toBeCloseTo(Math.pow(1.105, 1 / 3) - 1, 8);
  });
  it('capitalisé : intérêts composés', () => {
    const r = calculateTermDeposit({ ...base, months: 24, paymentMode: 'capitalized', taxRegime: 'none' });
    expect(r.finalGross).toBeCloseTo(100_000 * 1.03 * 1.03, 6);
  });
  it('sortie anticipée : intérêts recalculés au taux de pénalité', () => {
    const r = calculateTermDeposit({ ...base, months: 36, earlyExit: true, exitMonth: 18, earlyRate: 0.01, taxRegime: 'none' });
    expect(r.grossInterest).toBeCloseTo(1500, 6);
    expect(r.penalty).toBeCloseTo(4500 - 1500, 6);
  });
  it('IS : intérêts courus imposés chaque année', () => {
    const r = calculateTermDeposit({ ...base, months: 24, taxRegime: 'is' });
    expect(r.rows.map((x) => x.tax)).toEqual([750, 750]);
  });
});

describe('Frais de garantie', () => {
  it('hypothèque : TPF 0,715 % des sommes garanties (capital + 20 %)', () => {
    const r = calculateGuarantee({ principal: 200_000, type: 'hypotheque' });
    expect(r.securedAmount).toBe(240_000);
    expect(r.publicityTax).toBeCloseTo(1716, 6);
    expect(r.csi).toBeCloseTo(120, 6);
    // 6 500 × 1,29 % + 10 500 × 0,532 % + 43 000 × 0,355 % + 180 000 × 0,266 %
    expect(r.notaryFeesHT).toBeCloseTo(83.85 + 55.86 + 152.65 + 478.8, 6);
  });
  it('HLS PD : pas de TPF, mêmes émoluments', () => {
    const h = calculateGuarantee({ principal: 200_000, type: 'hypotheque' });
    const l = calculateGuarantee({ principal: 200_000, type: 'hlspd' });
    expect(l.publicityTax).toBe(0);
    expect(h.total - l.total).toBeCloseTo(1716, 6);
  });
  it('mixte : TPF sur la seule part hypothécaire', () => {
    const r = calculateGuarantee({ principal: 200_000, type: 'mixte', hlspdAmount: 150_000 });
    expect(r.publicityTax).toBeCloseTo(60_000 * 0.00715, 6);
  });
});

describe('Structurés — compléments', () => {
  it('trajectoire volatile : niveau final = cible, reproductible par graine', () => {
    const a = buildVolatilePath(-0.25, 0.3, 8, 1, 7);
    expect(a.length).toBe(8);
    expect(a[7]).toBeCloseTo(0.75, 4);
    expect(buildVolatilePath(-0.25, 0.3, 8, 1, 7)).toEqual(a);
    expect(buildVolatilePath(-0.25, 0.3, 8, 1, 8)).not.toEqual(a);
    const flat = buildVolatilePath(0.1, 0, 5, 1, 1);
    flat.forEach((x, k) => expect(x).toBeCloseTo(Math.exp(Math.log(1.1) * (k + 1) / 5), 4));
  });
  const cp: StructuredInput = { productType: 'capital-protected', capital: 100_000, issueDate: '2026-01-15', maturityYears: 5, observationsPerYear: 1, couponRate: 0, couponBarrier: 0, memory: false, autocallBarrier: 2, protectionBarrier: 0, protectionLevel: 0.95, participation: 0.8, cap: 1.3 };
  it('capital protégé : protection, participation et plafond', () => {
    expect(runStructured(cp, buildPath(-0.4, 5, 'linear')).capitalReturned).toBeCloseTo(95_000, 6);
    expect(runStructured(cp, buildPath(0.25, 5, 'linear')).capitalReturned).toBeCloseTo(120_000, 6);
    expect(runStructured(cp, buildPath(0.6, 5, 'linear')).capitalReturned).toBeCloseTo(130_000, 6);
  });
  it('fiscalité : coupons au fil de l’eau vs gain global en sortie', () => {
    const rc: StructuredInput = { productType: 'reverse-convertible', capital: 100_000, issueDate: '2026-01-15', maturityYears: 2, observationsPerYear: 1, couponRate: 0.07, couponBarrier: 0, memory: false, autocallBarrier: 2, protectionBarrier: 0.7 };
    const s = runStructured(rc, [1, 1]);
    const flow = taxStructuredScenario(s, 100_000, 1, 0.3, false);
    expect(flow.tax).toBeCloseTo(4200, 6);
    const ko = runStructured(rc, [0.9, 0.5]); // perte : coupons taxés, moins-value non imputée
    expect(taxStructuredScenario(ko, 100_000, 1, 0.3, false).tax).toBeCloseTo(4200, 6);
    expect(taxStructuredScenario(ko, 100_000, 1, 0.3, true).tax).toBe(0);
  });
});

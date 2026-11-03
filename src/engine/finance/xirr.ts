import { z } from 'zod';
import { CalculationError, validate } from '../core/errors';
import { isValidISO, parseISO } from '../core/dates';
import { solveRoot } from '../core/solver';

/**
 * TRI / XIRR — Taux de rendement interne de flux irréguliers datés.
 * Convention identique à la fonction TRI.PAIEMENTS (XIRR) d'Excel :
 *   Σ CF_i / (1 + r)^((d_i − d_0) / 365) = 0
 * Signe : décaissements (investissements) négatifs, encaissements positifs.
 */
export const xirrSchema = z.object({
  flows: z
    .array(z.object({
      date: z.string().refine(isValidISO, 'Date invalide (format AAAA-MM-JJ)'),
      amount: z.number({ message: 'Montant invalide' }).finite(),
    }))
    .min(2, 'Au moins deux flux sont nécessaires')
    .refine((fs) => fs.some((f) => f.amount < 0) && fs.some((f) => f.amount > 0), {
      message: 'Il faut au moins un flux négatif (investissement) et un flux positif (remboursement / valorisation)',
    }),
  guess: z.number().optional(),
});
export type XirrInput = z.input<typeof xirrSchema>;

export function xnpv(rate: number, flows: { t: number; amount: number }[]): number {
  return flows.reduce((acc, f) => acc + f.amount / Math.pow(1 + rate, f.t), 0);
}

export function calculateXIRR(raw: XirrInput) {
  const p = validate(xirrSchema, raw);
  const sorted = [...p.flows].map((f) => ({ ...f, d: parseISO(f.date) })).sort((a, b) => a.d.getTime() - b.d.getTime());
  const d0 = sorted[0].d.getTime();
  const flows = sorted.map((f) => ({ date: f.date, amount: f.amount, t: (f.d.getTime() - d0) / 86_400_000 / 365 }));
  if (flows[flows.length - 1].t === 0) throw new CalculationError('Tous les flux sont à la même date : TRI non défini.');

  const sol = solveRoot((r) => xnpv(r, flows), { guess: p.guess ?? 0.1, lo: -0.9999, hi: 100, tol: 1e-9 });
  // Contrôle de convergence : la VAN au taux trouvé doit être ~0 relativement aux flux
  const scale = flows.reduce((a, f) => a + Math.abs(f.amount), 0);
  const residual = xnpv(sol.root, flows);
  const converged = Math.abs(residual) / scale < 1e-8;
  if (!converged) throw new CalculationError('Le TRI n’a pas convergé de façon fiable pour ces flux.');

  // Changements de signe (règle de Descartes) : plusieurs TRI possibles si > 1
  let signChanges = 0;
  for (let i = 1; i < flows.length; i++) if (Math.sign(flows[i].amount) !== Math.sign(flows[i - 1].amount)) signChanges++;

  const invested = -flows.filter((f) => f.amount < 0).reduce((a, f) => a + f.amount, 0);
  const returned = flows.filter((f) => f.amount > 0).reduce((a, f) => a + f.amount, 0);
  const durationYears = flows[flows.length - 1].t;

  return {
    irr: sol.root,
    iterations: sol.iterations,
    method: sol.method,
    residual,
    multipleSignChanges: signChanges > 1,
    invested,
    returned,
    netGain: returned - invested,
    multiple: invested > 0 ? returned / invested : NaN,
    durationYears,
    flows,
  };
}

/* ------------------------------------------------------------------ */
/* CAGR                                                                */
/* ------------------------------------------------------------------ */
export const cagrSchema = z.object({
  initialValue: z.number().positive('La valeur initiale doit être strictement positive'),
  finalValue: z.number().min(0, 'La valeur finale doit être positive ou nulle'),
  years: z.number().positive('La durée doit être strictement positive').max(200),
});
export type CagrInput = z.input<typeof cagrSchema>;

/** CAGR = (Vf / Vi)^(1/n) − 1 */
export function calculateCAGR(raw: CagrInput) {
  const p = validate(cagrSchema, raw);
  const totalReturn = p.finalValue / p.initialValue - 1;
  const cagr = p.finalValue === 0 ? -1 : Math.pow(p.finalValue / p.initialValue, 1 / p.years) - 1;
  const path = Array.from({ length: Math.floor(p.years) + 1 }, (_, i) => ({ year: i, value: p.initialValue * Math.pow(1 + cagr, i) }));
  return { cagr, totalReturn, multiple: p.finalValue / p.initialValue, path };
}

/* ------------------------------------------------------------------ */
/* Actualisation                                                       */
/* ------------------------------------------------------------------ */
export const discountSchema = z.object({
  futureValue: z.number().min(0, 'La valeur future doit être positive'),
  rate: z.number().min(-0.5).max(1),
  years: z.number().positive('Durée strictement positive').max(100),
  compounding: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(12)]).default(1),
  inflation: z.number().min(-0.1).max(0.5).default(0),
});
export type DiscountInput = z.input<typeof discountSchema>;

/** VA = VF / (1 + r/m)^(m×n). Valeur réelle = VF / (1 + π)^n. */
export function calculatePresentValue(raw: DiscountInput) {
  const p = validate(discountSchema, raw);
  const factor = Math.pow(1 + p.rate / p.compounding, -p.compounding * p.years);
  const presentValue = p.futureValue * factor;
  const realValue = p.futureValue / Math.pow(1 + p.inflation, p.years);
  const table = Array.from({ length: Math.ceil(p.years) }, (_, i) => {
    const t = Math.min(i + 1, p.years);
    return { year: t, discountFactor: Math.pow(1 + p.rate / p.compounding, -p.compounding * t), pv: p.futureValue * Math.pow(1 + p.rate / p.compounding, -p.compounding * t) };
  });
  return { presentValue, discountFactor: factor, discount: p.futureValue - presentValue, realValue, table };
}

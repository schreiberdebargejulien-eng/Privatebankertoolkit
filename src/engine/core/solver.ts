import { CalculationError } from './errors';

export interface SolveResult {
  root: number;
  iterations: number;
  converged: boolean;
  method: 'newton' | 'bisection';
  residual: number;
}

/**
 * Recherche de racine robuste : Newton-Raphson (dérivée numérique) avec repli
 * sur bissection si Newton diverge ou sort de l'intervalle [lo, hi].
 */
export function solveRoot(
  f: (x: number) => number,
  opts: { guess: number; lo: number; hi: number; tol?: number; maxIter?: number },
): SolveResult {
  const tol = opts.tol ?? 1e-10;
  const maxIter = opts.maxIter ?? 200;
  // 1) Newton
  let x = opts.guess;
  for (let i = 0; i < 50; i++) {
    const fx = f(x);
    if (!Number.isFinite(fx)) break;
    if (Math.abs(fx) < tol) return { root: x, iterations: i, converged: true, method: 'newton', residual: fx };
    const h = Math.max(1e-7, Math.abs(x) * 1e-7);
    const d = (f(x + h) - f(x - h)) / (2 * h);
    if (!Number.isFinite(d) || Math.abs(d) < 1e-14) break;
    const nx = x - fx / d;
    if (!Number.isFinite(nx) || nx <= opts.lo || nx >= opts.hi) break;
    if (Math.abs(nx - x) < 1e-13) {
      const r = f(nx);
      return { root: nx, iterations: i + 1, converged: Math.abs(r) < Math.max(tol, 1e-7), method: 'newton', residual: r };
    }
    x = nx;
  }
  // 2) Bissection : recherche d'un changement de signe
  let lo = opts.lo, hi = opts.hi;
  let flo = f(lo), fhi = f(hi);
  if (!(Number.isFinite(flo) && Number.isFinite(fhi)) || flo * fhi > 0) {
    // balayage pour trouver un intervalle encadrant
    const steps = 400;
    let found = false;
    let prevX = lo, prevF = flo;
    for (let k = 1; k <= steps; k++) {
      const xk = lo + ((hi - lo) * k) / steps;
      const fk = f(xk);
      if (Number.isFinite(prevF) && Number.isFinite(fk) && prevF * fk <= 0) {
        lo = prevX; hi = xk; flo = prevF; fhi = fk; found = true; break;
      }
      prevX = xk; prevF = fk;
    }
    if (!found) throw new CalculationError('Aucune solution trouvée : la fonction ne change pas de signe sur l’intervalle étudié (vérifiez le signe des flux).');
  }
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < tol || (hi - lo) / 2 < 1e-12) {
      return { root: mid, iterations: i, converged: true, method: 'bisection', residual: fm };
    }
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  throw new CalculationError('Le calcul n’a pas convergé.');
}

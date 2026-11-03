import type { ZodError, ZodType, ZodTypeDef } from 'zod';

/** Erreur de saisie : le calcul est refusé plutôt que de produire un résultat faux. */
export class ValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(issues.join(' · '));
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

/** Erreur numérique (non-convergence, domaine invalide…). */
export class CalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalculationError';
  }
}

export function zodIssues(err: ZodError): string[] {
  return err.issues.map((i) => i.message);
}

/** Valide une entrée avec un schéma Zod et lève ValidationError en cas d'échec. */
export function validate<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new ValidationError(zodIssues(r.error));
  return r.data;
}

export type SafeResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Exécute un calcul et capture les erreurs pour l'interface. */
export function safeCalc<T>(fn: () => T): SafeResult<T> {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, errors: e.issues };
    if (e instanceof CalculationError) return { ok: false, errors: [e.message] };
    return { ok: false, errors: ['Erreur inattendue : ' + (e instanceof Error ? e.message : String(e))] };
  }
}

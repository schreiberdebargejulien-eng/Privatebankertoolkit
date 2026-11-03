/**
 * Métadonnées communes à toute règle fiscale versionnée.
 * Architecture multi-juridictions : chaque juridiction (FR, LU, CH, BE…) expose
 * son propre registre de règles ; les moteurs de calcul reçoivent la version en paramètre.
 */
export type Jurisdiction = 'FR';

export type VerificationStatus =
  /** Valeurs relevées sur une source officielle (Légifrance, BOFiP, impots.gouv). */
  | 'official'
  /** Valeurs recoupées entre plusieurs sources (dont au moins une officielle partielle). */
  | 'cross-checked'
  /** À confirmer : texte non définitif ou source non officielle. */
  | 'to-confirm';

export interface Source {
  label: string;
  url: string;
}

export interface RuleMeta {
  id: string;
  jurisdiction: Jurisdiction;
  label: string;
  /** Date d'effet ISO. */
  effectiveFrom: string;
  /** Champ d'application (ex. « Revenus 2025 — impôt payé en 2026 »). */
  scope: string;
  sources: Source[];
  /** Date de dernière vérification ISO. */
  lastVerified: string;
  status: VerificationStatus;
  notes?: string[];
}

export interface Versioned<T> {
  meta: RuleMeta;
  params: T;
}

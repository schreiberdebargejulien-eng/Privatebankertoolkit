import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Settings } from '@/lib/settings';

export type Values = Record<string, any>;

export type CategoryId =
  | 'finance' | 'fiscalite' | 'assurance-vie' | 'retraite' | 'transmission' | 'credit'
  | 'structures' | 'obligations' | 'allocation' | 'immobilier' | 'entreprise';

export type SectionId = 'calculators' | 'investments' | 'wealth';

/** Définition déclarative d'un champ de formulaire. */
export type FieldDef =
  | { kind: 'group'; label: string; visibleIf?: (v: Values) => boolean }
  | ({
      key: string;
      label: string;
      hint?: string;
      visibleIf?: (v: Values) => boolean;
      /** Libellé utilisé dans le rapport (si différent). */
      reportLabel?: string;
    } & (
      | { kind: 'money'; min?: number; max?: number; slider?: { min: number; max: number; step: number } }
      | { kind: 'percent'; min?: number; max?: number; step?: number; slider?: { min: number; max: number; step: number }; digits?: number }
      | { kind: 'number'; unit?: string; min?: number; max?: number; integer?: boolean; slider?: { min: number; max: number; step: number } }
      | { kind: 'select'; options: { value: string | number; label: string }[] }
      | { kind: 'segmented'; options: { value: string | number; label: string }[] }
      | { kind: 'toggle' }
      | { kind: 'date' }
      | { kind: 'text'; maxLength?: number; placeholder?: string }
    ));

export type InputField = Exclude<FieldDef, { kind: 'group' }>;

export interface ReportMetric { label: string; value: string; tone?: 'pos' | 'neg' | 'accent' | 'muted'; hint?: string }
export interface ReportTable { title: string; columns: string[]; rows: (string | number)[][]; align?: ("left" | "right")[]; maxRowsInline?: number; /** Uniquement dans l’export PDF / copie. */ pdfOnly?: boolean }

export interface Report {
  headline: { label: string; value: string; tone?: 'pos' | 'neg' | 'accent'; sub?: string };
  metrics: ReportMetric[];
  tables?: ReportTable[];
  /** Hypothèses de calcul (conventions, règles appliquées). */
  assumptions: string[];
  warnings: string[];
  /** Identifiants des barèmes utilisés (affichage des sources et dates). */
  rules?: string[];
}

export interface ComputeOutput {
  report: Report;
  chart?: ReactNode;
  /** Contenu spécifique additionnel (ex. tableau chronologique enrichi). */
  extra?: ReactNode;
}

export interface CustomFormProps { values: Values; set: (patch: Values) => void }

export interface SimulatorDef {
  id: string;
  title: string;
  short: string;
  description: string;
  categories: CategoryId[];
  sections: SectionId[];
  keywords: string[];
  icon: LucideIcon;
  defaults: (s: Settings) => Values;
  fields: FieldDef[];
  /** Section de formulaire personnalisée (listes dynamiques…), insérée après les champs `customAfter`. */
  customForm?: (p: CustomFormProps) => ReactNode;
  customFormPosition?: 'start' | 'end';
  compute: (v: Values, s: Settings) => ComputeOutput;
  /** Formules documentées (affichées dans « Méthode de calcul »). */
  formula: string[];
  example: string;
  /** Marque le simulateur comme fiscal (mention « estimation »). */
  fiscal?: boolean;
}

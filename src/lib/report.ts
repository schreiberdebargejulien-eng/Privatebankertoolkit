import type { Report } from '@/simulators/types';
import { ALL_RULES } from '@/engine';
import { dateFR } from './format';

export interface ReportDoc {
  title: string;
  description: string;
  inputs: { label: string; value: string }[];
  report: Report;
  fiscal?: boolean;
}

export const DISCLAIMER_FISCAL = 'Estimation indicative fondée sur les hypothèses saisies et les barèmes en vigueur référencés. Ce document ne constitue ni un avis fiscal ni un conseil juridique.';
export const DISCLAIMER_INVEST = 'Simulation non contractuelle. Les performances passées ou simulées ne préjugent pas des performances futures et ne constituent pas une garantie.';

export function rulesFor(ids?: string[]) {
  return (ids ?? []).map((id) => ALL_RULES.find((r) => r.id === id)).filter(Boolean) as typeof ALL_RULES;
}

/** Texte brut pour le presse-papiers (sans donnée personnelle). */
export function reportToText(doc: ReportDoc): string {
  const L: string[] = [];
  const now = new Date();
  L.push(`${doc.title.toUpperCase()} — ${now.toLocaleDateString('fr-FR')}`);
  L.push('');
  L.push(`${doc.report.headline.label} : ${doc.report.headline.value}`);
  if (doc.report.headline.sub) L.push(doc.report.headline.sub);
  L.push('');
  L.push('Résultats');
  doc.report.metrics.forEach((m) => L.push(`• ${m.label} : ${m.value}`));
  L.push('');
  L.push('Hypothèses saisies');
  doc.inputs.forEach((i) => L.push(`• ${i.label} : ${i.value}`));
  if (doc.report.assumptions.length) {
    L.push('');
    L.push('Méthode et hypothèses');
    doc.report.assumptions.forEach((a) => L.push(`• ${a}`));
  }
  if (doc.report.warnings.length) {
    L.push('');
    L.push('Points d’attention');
    doc.report.warnings.forEach((a) => L.push(`• ${a}`));
  }
  const rules = rulesFor(doc.report.rules);
  if (rules.length) {
    L.push('');
    L.push('Barèmes utilisés');
    rules.forEach((r) => L.push(`• ${r.label} — vérifié le ${dateFR(r.lastVerified)}`));
  }
  L.push('');
  L.push(doc.fiscal ? DISCLAIMER_FISCAL : DISCLAIMER_INVEST);
  L.push('Private Banker Toolkit');
  return L.join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

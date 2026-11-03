import type { ReportDoc } from './report';
import { DISCLAIMER_FISCAL, DISCLAIMER_INVEST, rulesFor } from './report';
import { dateFR } from './format';

/**
 * Export PDF généré localement (jsPDF) — aucun envoi réseau.
 * Les polices standard PDF utilisent l'encodage WinAnsi : les caractères hors jeu
 * (espaces fines, signes mathématiques) sont remplacés par des équivalents.
 */
export function pdfSafe(s: string): string {
  return s
    .replace(/[   ]/g, ' ')
    .replace(/−/g, '-')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/→/g, '->')
    .replace(/≈/g, '~')
    .replace(/≠/g, '<>')
    .replace(/β/g, 'beta')
    .replace(/Σ/g, 'Somme')
    .replace(/√/g, 'racine')
    .replace(/[→⇒]/g, '->')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '?');
}

export async function exportPDF(doc: ReportDoc) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableMod.default;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const M = 40;
  const NIGHT: [number, number, number] = [16, 28, 44];
  const GOLD: [number, number, number] = [197, 164, 109];
  const GREY: [number, number, number] = [110, 121, 136];

  // En-tête
  pdf.setFillColor(...NIGHT);
  pdf.rect(0, 0, W, 86, 'F');
  pdf.setTextColor(...GOLD);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('PRIVATE BANKER TOOLKIT', M, 30);
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.text(pdfSafe(doc.title), M, 56);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(200, 205, 214);
  pdf.text(pdfSafe(`Simulation du ${new Date().toLocaleDateString('fr-FR')}`), M, 74);

  let y = 112;
  pdf.setTextColor(...GREY);
  pdf.setFontSize(9);
  pdf.text(pdfSafe(doc.report.headline.label.toUpperCase()), M, y);
  y += 26;
  pdf.setTextColor(...NIGHT);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(24);
  pdf.text(pdfSafe(doc.report.headline.value), M, y);
  if (doc.report.headline.sub) {
    y += 16;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(...GREY);
    pdf.text(pdfSafe(doc.report.headline.sub), M, y);
  }
  y += 18;

  const tableTheme = {
    theme: 'plain' as const,
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: NIGHT, lineColor: [223, 228, 235] as [number, number, number], lineWidth: { bottom: 0.5 } },
    headStyles: { fontStyle: 'bold' as const, textColor: GREY, fontSize: 8 },
    margin: { left: M, right: M },
  };
  const section = (title: string) => {
    const last = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = Math.max(y, last ? last.finalY + 22 : y);
    if (y > 760) { pdf.addPage(); y = 50; }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...GOLD);
    pdf.text(pdfSafe(title.toUpperCase()), M, y);
    y += 6;
  };

  section('Résultats');
  autoTable(pdf, { ...tableTheme, startY: y, body: doc.report.metrics.map((m) => [pdfSafe(m.label), pdfSafe(m.value)]), columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } } });

  for (const t of doc.report.tables ?? []) {
    section(t.title);
    autoTable(pdf, {
      ...tableTheme,
      startY: y,
      head: [t.columns.map(pdfSafe)],
      body: t.rows.map((r) => r.map((c) => pdfSafe(String(c)))),
      columnStyles: Object.fromEntries(t.columns.map((_, k) => [k, { halign: (t.align?.[k] ?? (k === 0 ? 'left' : 'right')) as 'left' | 'right' }])),
      styles: { ...tableTheme.styles, fontSize: t.columns.length > 5 ? 7.5 : 8.5 },
    });
  }

  section('Hypothèses saisies');
  autoTable(pdf, { ...tableTheme, startY: y, body: doc.inputs.map((i) => [pdfSafe(i.label), pdfSafe(i.value)]), columnStyles: { 1: { halign: 'right' } } });

  const bullets = (title: string, items: string[]) => {
    if (!items.length) return;
    section(title);
    autoTable(pdf, { ...tableTheme, startY: y, body: items.map((a) => ['•', pdfSafe(a)]), columnStyles: { 0: { cellWidth: 12 } }, styles: { ...tableTheme.styles, lineWidth: 0 } });
  };
  bullets('Méthode et hypothèses de calcul', doc.report.assumptions);
  bullets('Points d’attention', doc.report.warnings);
  const rules = rulesFor(doc.report.rules);
  bullets('Barèmes et sources', rules.map((r) => `${r.label} — ${r.scope} — vérifié le ${dateFR(r.lastVerified)} — ${r.sources.map((s) => s.label).join(' ; ')}`));

  // Pied de page
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(...GREY);
    const disc = pdf.splitTextToSize(pdfSafe(doc.fiscal ? DISCLAIMER_FISCAL : DISCLAIMER_INVEST), W - 2 * M - 40);
    pdf.text(disc, M, 806);
    pdf.text(`${p} / ${pages}`, W - M, 806, { align: 'right' });
  }
  const name = `${doc.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(name);
}

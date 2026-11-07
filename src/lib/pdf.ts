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
  // Identité : encre presque noire, accent bleu profond, gris secondaire, filets clairs
  const NIGHT: [number, number, number] = [23, 25, 28];
  const GOLD: [number, number, number] = [49, 94, 145];
  const GREY: [number, number, number] = [106, 112, 121];

  const H = pdf.internal.pageSize.getHeight();
  const CONTENT_W = W - 2 * M;
  const BOTTOM = 64; // réserve pour le pied de page (avertissement + pagination)
  const LIMIT = H - BOTTOM;

  // En-tête
  pdf.setFillColor(...GOLD);
  pdf.roundedRect(M, 20, 14, 14, 3, 3, 'F');
  pdf.setTextColor(...GOLD);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('PRIVATE BANKER TOOLKIT', M + 22, 30);
  pdf.setTextColor(...NIGHT);
  pdf.setFontSize(18);
  pdf.text(pdf.splitTextToSize(pdfSafe(doc.title), CONTENT_W)[0], M, 56);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...GREY);
  pdf.text(pdfSafe(`Simulation du ${new Date().toLocaleDateString('fr-FR')}`), M, 74);
  pdf.setDrawColor(232, 234, 237);
  pdf.setLineWidth(0.5);
  pdf.line(M, 88, W - M, 88);

  let y = 112;
  pdf.setTextColor(...GREY);
  pdf.setFontSize(9);
  pdf.text(pdf.splitTextToSize(pdfSafe(doc.report.headline.label.toUpperCase()), CONTENT_W), M, y);
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
    const lines: string[] = pdf.splitTextToSize(pdfSafe(doc.report.headline.sub), CONTENT_W);
    pdf.text(lines, M, y);
    y += (lines.length - 1) * 12;
  }
  y += 26;

  type Align = 'left' | 'right';
  const tableTheme = {
    theme: 'plain' as const,
    styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 5, right: 5 }, valign: 'middle' as const, overflow: 'linebreak' as const, textColor: NIGHT, lineColor: [232, 234, 237] as [number, number, number], lineWidth: { bottom: 0.5 } },
    headStyles: { fontStyle: 'bold' as const, textColor: GREY, fontSize: 8 },
    margin: { left: M, right: M, top: 50, bottom: BOTTOM },
    tableWidth: CONTENT_W,
  };
  /** Aligne les en-têtes de colonnes sur l'alignement des données (sinon en-têtes à gauche, chiffres à droite). */
  const alignHead = (aligns: Align[]) => (data: { section: string; column: { index: number }; cell: { styles: { halign?: string } } }) => {
    if (data.section === 'head') data.cell.styles.halign = aligns[data.column.index] ?? 'left';
  };
  const section = (title: string) => {
    const last = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = Math.max(y, last ? last.finalY + 22 : y);
    if (y > LIMIT - 60) { pdf.addPage(); y = 50; }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...GOLD);
    pdf.text(pdfSafe(title.toUpperCase()), M, y);
    y += 6;
  };
  /** Tableau libellé / valeur à largeurs fixes : toutes les sections clé-valeur sont alignées sur la même colonne. */
  const keyValue = (rows: string[][], boldValue: boolean) => {
    autoTable(pdf, {
      ...tableTheme,
      startY: y,
      body: rows,
      columnStyles: { 0: { cellWidth: CONTENT_W * 0.6 }, 1: { cellWidth: CONTENT_W * 0.4, halign: 'right', fontStyle: boldValue ? 'bold' : 'normal' } },
    });
  };

  section('Résultats');
  keyValue(doc.report.metrics.map((m) => [pdfSafe(m.label), pdfSafe(m.value)]), true);

  /**
   * Largeurs de colonnes communes à tous les tableaux de même structure (mêmes en-têtes) :
   * les tableaux successifs (ex. observations par scénario) restent alignés colonne par colonne.
   */
  const fontFor = (n: number) => (n > 8 ? 6.5 : n > 5 ? 7.5 : 8.5);
  const widthsBySignature = new Map<string, number[]>();
  for (const t of doc.report.tables ?? []) {
    const sig = t.columns.join('|');
    const n = t.columns.length;
    const pad = n > 8 ? 6 : 10;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(fontFor(n));
    const prev = widthsBySignature.get(sig) ?? t.columns.map((c) => pdf.getTextWidth(pdfSafe(c)) + pad);
    pdf.setFont('helvetica', 'normal');
    const w = prev.map((x, k) => Math.max(x, ...t.rows.map((r) => pdf.getTextWidth(pdfSafe(String(r[k] ?? ''))) + pad)));
    widthsBySignature.set(sig, w);
  }
  const columnWidths = (sig: string) => {
    const w = widthsBySignature.get(sig)!;
    const total = w.reduce((a, b) => a + b, 0);
    if (total <= CONTENT_W) {
      // Espace restant réparti proportionnellement
      return w.map((x) => (x / total) * CONTENT_W);
    }
    // Trop large : colonnes plafonnées, la plus longue (texte) passe à la ligne
    const cap = CONTENT_W / w.length;
    const small = w.filter((x) => x <= cap).reduce((a, b) => a + b, 0);
    const bigTotal = w.filter((x) => x > cap).reduce((a, b) => a + b, 0);
    return w.map((x) => (x <= cap ? x : (x / bigTotal) * (CONTENT_W - small)));
  };

  for (const t of doc.report.tables ?? []) {
    section(t.title);
    const aligns: Align[] = t.columns.map((_, k) => t.align?.[k] ?? (k === 0 ? 'left' : 'right'));
    const n = t.columns.length;
    const widths = columnWidths(t.columns.join('|'));
    autoTable(pdf, {
      ...tableTheme,
      startY: y,
      head: [t.columns.map(pdfSafe)],
      body: t.rows.map((r) => r.map((c) => pdfSafe(String(c)))),
      columnStyles: Object.fromEntries(aligns.map((a, k) => [k, { halign: a, cellWidth: widths[k] }])),
      styles: { ...tableTheme.styles, fontSize: fontFor(n), cellPadding: n > 8 ? { top: 3, bottom: 3, left: 3, right: 3 } : tableTheme.styles.cellPadding },
      headStyles: { ...tableTheme.headStyles, fontSize: n > 8 ? 6.5 : 8 },
      didParseCell: alignHead(aligns),
    });
  }

  section('Hypothèses saisies');
  keyValue(doc.inputs.map((i) => [pdfSafe(i.label), pdfSafe(i.value)]), false);

  const bullets = (title: string, items: string[]) => {
    if (!items.length) return;
    section(title);
    autoTable(pdf, {
      ...tableTheme,
      startY: y,
      body: items.map((a) => ['•', pdfSafe(a)]),
      columnStyles: { 0: { cellWidth: 16, halign: 'center', valign: 'top' }, 1: { cellWidth: CONTENT_W - 16, valign: 'top' } },
      styles: { ...tableTheme.styles, lineWidth: 0, cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } },
    });
  };
  bullets('Méthode et hypothèses de calcul', doc.report.assumptions.filter(Boolean));
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
    pdf.setDrawColor(232, 234, 237);
    pdf.line(M, H - 48, W - M, H - 48);
    pdf.text(disc, M, H - 36);
    pdf.text(`${p} / ${pages}`, W - M, H - 36, { align: 'right' });
  }
  const name = `${doc.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(name);
}

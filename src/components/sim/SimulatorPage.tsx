import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bookmark, Copy, FileDown, RotateCcw, Share2, Star, Check } from 'lucide-react';
import type { FieldDef, InputField, SimulatorDef, Values } from '@/simulators/types';
import { Button, Card } from '@/components/ui/primitives';
import { FieldRenderer, displayFieldValue } from './FieldRenderer';
import { Assumptions, DataTable, Headline, Method, Metrics, RulesUsed, Warnings } from './ResultBlocks';
import { safeCalc } from '@/engine';
import { useSettings } from '@/lib/settings';
import { useFavorites, useRecents, useScenarios } from '@/lib/store';
import { dateFR, money, num, pct } from '@/lib/format';
import { copyText, reportToText, DISCLAIMER_FISCAL, DISCLAIMER_INVEST, type ReportDoc } from '@/lib/report';
import { decodeValues, shareUrl } from '@/lib/share';
import { cn } from '@/lib/cn';
import { Toast, useToast } from '@/components/ui/Toast';

function groupFields(fields: FieldDef[]) {
  const groups: { label?: string; visibleIf?: (v: Values) => boolean; fields: InputField[] }[] = [];
  let cur: (typeof groups)[number] = { fields: [] };
  for (const f of fields) {
    if (f.kind === 'group') {
      if (cur.fields.length || cur.label) groups.push(cur);
      cur = { label: f.label, visibleIf: f.visibleIf, fields: [] };
    } else cur.fields.push(f);
  }
  groups.push(cur);
  return groups.filter((g) => g.fields.length);
}

export function SimulatorPage({ def }: { def: SimulatorDef }) {
  const { settings } = useSettings();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { isFavorite, toggle } = useFavorites();
  const { track } = useRecents();
  const { scenarios, save } = useScenarios();
  const { toast, show } = useToast();

  const initial = useMemo(() => {
    const d = def.defaults(settings);
    const s = params.get('s');
    if (s) { const dec = decodeValues(s); if (dec) return { ...d, ...dec }; }
    const sc = params.get('scenario');
    if (sc) { const found = scenarios.find((x) => x.id === sc); if (found) return { ...d, ...found.values }; }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.id]);
  const [values, setValues] = useState<Values>(initial);
  useEffect(() => setValues(initial), [initial]);
  useEffect(() => { track(def.id); window.scrollTo(0, 0); /* eslint-disable-next-line */ }, [def.id]);

  const set = (p: Values) => setValues((v) => ({ ...v, ...p }));
  const groups = useMemo(() => groupFields(def.fields), [def.fields]);
  const visibleFields = def.fields.filter((f): f is InputField => f.kind !== 'group' && (!f.visibleIf || f.visibleIf(values)));

  const missing = visibleFields.filter((f) => ['money', 'percent', 'number'].includes(f.kind) && (values[f.key] === null || values[f.key] === undefined || Number.isNaN(values[f.key])));
  const result = useMemo(() => {
    if (missing.length) return { ok: false as const, errors: missing.map((f) => `Champ requis : ${f.label}`) };
    return safeCalc(() => def.compute(values, settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, settings, def]);

  const inputsForReport = visibleFields.map((f) => ({ label: f.reportLabel ?? f.label, value: displayFieldValue(f, values[f.key], { money, pct, num, date: dateFR }) }));
  const doc: ReportDoc | null = result.ok ? { title: def.title, description: def.short, inputs: inputsForReport, report: result.value.report, fiscal: def.fiscal } : null;

  const resultsRef = useRef<HTMLDivElement>(null);
  const [resultsVisible, setResultsVisible] = useState(false);
  useEffect(() => {
    const el = resultsRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setResultsVisible(e.isIntersecting), { rootMargin: '0px 0px -30% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const fav = isFavorite(def.id);
  const onCopy = async () => { if (doc) show((await copyText(reportToText(doc))) ? 'Résultats copiés' : 'Copie impossible'); };
  const onPDF = async () => {
    if (!doc) return;
    try { const { exportPDF } = await import('@/lib/pdf'); await exportPDF(doc); show('PDF généré'); } catch { show('Export PDF impossible'); }
  };
  const onShare = async () => {
    const textKeys = def.fields.filter((f) => f.kind === 'text').map((f) => (f as InputField).key);
    const clean = Object.fromEntries(Object.entries(values).filter(([k]) => !textKeys.includes(k)));
    const url = shareUrl(def.id, clean);
    if (navigator.share) {
      try { await navigator.share({ title: def.title, url }); return; } catch { /* annulé */ }
    }
    show((await copyText(url)) ? 'Lien de simulation copié (sans donnée personnelle)' : 'Partage impossible');
  };
  const onSave = () => {
    const label = window.prompt('Nom du scénario (évitez tout nom de client) :', `${def.title} — ${new Date().toLocaleDateString('fr-FR')}`);
    if (label === null) return;
    save({ simId: def.id, label: label.slice(0, 60) || def.title, values });
    show('Scénario enregistré sur cet appareil');
  };
  const onReset = () => { setValues(def.defaults(settings)); show('Valeurs par défaut restaurées'); };

  const Icon = def.icon;
  return (
    <div className="pb-40 lg:pb-10">
      {/* En-tête */}
      <div className="sticky top-0 z-20 bg-bg/85 backdrop-blur-xl safe-top no-print">
        <div className="flex items-center gap-1 px-2 md:px-6 h-14 max-w-6xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Retour"><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex-1 min-w-0 text-[15px] font-semibold truncate">{def.title}</div>
          <Button variant="ghost" size="icon" onClick={onReset} aria-label="Réinitialiser"><RotateCcw className="h-[18px] w-[18px]" /></Button>
          <Button variant="ghost" size="icon" onClick={() => { toggle(def.id); show(fav ? 'Retiré des favoris' : 'Ajouté aux favoris'); }} aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-pressed={fav}>
            <Star className={cn('h-5 w-5', fav && 'fill-gold text-gold')} />
          </Button>
        </div>
      </div>

      <div className="px-4 md:px-8 max-w-2xl md:max-w-3xl lg:max-w-6xl mx-auto">
        <div className="flex items-start gap-3 pt-1 pb-4 lg:pb-6">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-accent/10 text-accent flex items-center justify-center"><Icon className="h-5 w-5" /></div>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight leading-tight">{def.title}</h1>
            <p className="text-[14px] text-muted mt-1 leading-snug">{def.description}</p>
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-6 lg:items-start">
        {/* Formulaire */}
        <div className="space-y-3">
          {def.customForm && def.customFormPosition === 'start' && def.customForm({ values, set })}
          {groups.map((g, gi) => (!g.visibleIf || g.visibleIf(values)) && (
            <Card key={gi} className="p-4">
              {g.label && <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-accent mb-3">{g.label}</div>}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
                {g.fields.filter((f) => !f.visibleIf || f.visibleIf(values)).map((f) => <FieldRenderer key={f.key} field={f} values={values} set={set} />)}
              </div>
            </Card>
          ))}
          {def.customForm && def.customFormPosition !== 'start' && def.customForm({ values, set })}
          <p className="text-[12px] text-muted px-1">Valeurs par défaut indicatives — à adapter à la situation étudiée.</p>
        </div>

        {/* Résultats (colonne de droite collante sur grand écran) */}
        <div className="mt-6 lg:mt-0 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:pb-6 lg:pr-1 scrollbar-none">
        <div ref={resultsRef} className="space-y-3 scroll-mt-16" id="results">
          {!result.ok ? (
            <Card className="p-4 border-neg/30 bg-neg/[0.05]">
              <div className="text-[13px] font-semibold text-neg mb-1.5">Calcul impossible</div>
              <ul className="text-[13px] text-fg/80 space-y-1 list-disc pl-4">{result.errors.map((e, k) => <li key={k}>{e}</li>)}</ul>
            </Card>
          ) : (
            <>
              <Headline report={result.value.report} fiscal={def.fiscal} />
              <Metrics items={result.value.report.metrics} />
              {result.value.chart && <Card className="p-3 pt-4">{result.value.chart}</Card>}
              {result.value.extra}
              {result.value.report.tables?.filter((t) => !t.pdfOnly).map((t, k) => <DataTable key={k} table={t} />)}
              <Assumptions items={result.value.report.assumptions} />
              <Warnings items={result.value.report.warnings} />
              <RulesUsed ids={result.value.report.rules} />
              <Method formula={def.formula} example={def.example} />
              <p className="text-[11.5px] text-muted leading-snug px-1 pt-1">{def.fiscal ? DISCLAIMER_FISCAL : DISCLAIMER_INVEST}</p>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-2 gap-2 mt-5 no-print">
          <Button onClick={onCopy} disabled={!doc}><Copy className="h-4 w-4" /> Copier</Button>
          <Button onClick={onPDF} disabled={!doc}><FileDown className="h-4 w-4" /> Export PDF</Button>
          <Button onClick={onShare}><Share2 className="h-4 w-4" /> Partager</Button>
          <Button onClick={onSave}><Bookmark className="h-4 w-4" /> Enregistrer</Button>
          <Button onClick={onReset} variant="ghost" className="col-span-2 md:col-span-4 lg:col-span-2 text-muted"><RotateCcw className="h-4 w-4" /> Réinitialiser</Button>
        </div>
        </div>
        </div>
      </div>

      {/* Barre de résultat flottante */}
      {result.ok && !resultsVisible && (
        <button
          onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="lg:hidden fixed left-3 right-3 z-30 mx-auto max-w-2xl md:max-w-3xl rounded-2xl bg-night text-white px-4 py-3 flex items-center justify-between shadow-xl shadow-night/30 no-print dark:bg-surface2 border border-white/5"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }}
        >
          <span className="text-[12px] uppercase tracking-[0.08em] text-gold truncate pr-3">{result.value.report.headline.label}</span>
          <span className="text-[17px] font-semibold tnum whitespace-nowrap flex items-center gap-1.5">{result.value.report.headline.value}<Check className="h-4 w-4 text-gold" /></span>
        </button>
      )}
      <Toast message={toast} />
      <span className="sr-only">{DISCLAIMER_INVEST}</span>
    </div>
  );
}

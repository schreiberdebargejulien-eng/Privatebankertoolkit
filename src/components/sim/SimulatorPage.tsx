import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bookmark, ChevronRight, Copy, FileDown, RotateCcw, Share2, Star, ChevronDown, AlertCircle } from 'lucide-react';
import type { FieldDef, InputField, SimulatorDef, Values } from '@/simulators/types';
import { Button, Card, FormCard, IconTile } from '@/components/ui/primitives';
import { FieldRenderer, displayFieldValue } from './FieldRenderer';
import { CalculationDetails, DataTable, Headline, LiveValue, Metrics, Warnings } from './ResultBlocks';
import { safeCalc } from '@/engine';
import { useSettings } from '@/lib/settings';
import { useFavorites, useRecents, useScenarios } from '@/lib/store';
import { dateFR, money, num, pct } from '@/lib/format';
import { copyText, reportToText, DISCLAIMER_FISCAL, DISCLAIMER_INVEST, type ReportDoc } from '@/lib/report';
import { decodeValues, shareUrl } from '@/lib/share';
import { CATEGORIES } from '@/simulators/catalog';
import { setDevSimContext } from '@/lib/devComments';
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

/** Les contrôles larges (segmentés, interrupteurs, texte) occupent toute la ligne dans une grille à deux colonnes. */
const isWide = (f: InputField) => f.kind === 'segmented' || f.kind === 'toggle' || f.kind === 'text' || (f.kind === 'select' && f.options.some((o) => o.label.length > 28));

/** Vrai dès que la page a défilé (bordure de la barre supérieure, titre compact). */
function useScrolled(threshold = 56) {
  const [s, set] = useState(false);
  useEffect(() => {
    const h = () => set(window.scrollY > threshold);
    h();
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, [threshold]);
  return s;
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

  /** Valeurs partageables : les champs texte libres sont exclus. */
  const shareableValues = useMemo(() => {
    const textKeys = def.fields.filter((f) => f.kind === 'text').map((f) => (f as InputField).key);
    return Object.fromEntries(Object.entries(values).filter(([k]) => !textKeys.includes(k)));
  }, [values, def.fields]);
  // Mode développeur : lien de reproduction joint, sur demande, aux commentaires de test.
  useEffect(() => {
    if (!settings.devMode) return;
    setDevSimContext({ simId: def.id, replayLink: shareUrl(def.id, shareableValues) });
    return () => setDevSimContext(null);
  }, [settings.devMode, def.id, shareableValues]);

  const fav = isFavorite(def.id);
  const onCopy = async () => { if (doc) show((await copyText(reportToText(doc))) ? 'Résultats copiés' : 'Copie impossible'); };
  const onPDF = async () => {
    if (!doc) return;
    try { const { exportPDF } = await import('@/lib/pdf'); await exportPDF(doc); show('PDF généré'); } catch { show('Export PDF impossible'); }
  };
  const onShare = async () => {
    const url = shareUrl(def.id, shareableValues);
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

  const scrolled = useScrolled();
  const Icon = def.icon;
  const catFound = CATEGORIES.find((c) => c.id === def.categories[0]);
  // Catégorie affichée seulement si elle apporte une information (≠ titre du simulateur)
  const cat = catFound && catFound.label !== def.title ? catFound : undefined;
  const favButton = (
    <Button variant="ghost" size="icon" onClick={() => { toggle(def.id); show(fav ? 'Retiré des favoris' : 'Ajouté aux favoris'); }} aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-pressed={fav} title={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
      <Star className={cn(fav && 'fill-accent text-accent')} strokeWidth={1.75} />
    </Button>
  );
  return (
    <div className="pb-[calc(env(safe-area-inset-bottom)+150px)] md:pb-28 lg:pb-12">
      {/* Barre supérieure */}
      <div className={cn('sticky top-0 z-30 chrome safe-top no-print border-b transition-colors duration-240', scrolled ? 'border-line' : 'border-transparent')}>
        <div className="flex items-center gap-1 h-12 md:h-14 px-2 md:px-6 lg:px-10 max-w-[1280px] mx-auto">
          <Button variant="ghost" size="icon" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Retour" title="Retour"><ArrowLeft strokeWidth={1.75} /></Button>
          <div className="flex-1 min-w-0 flex items-center gap-1.5 text-[13.5px]">
            {cat && <Link to={`/calculateurs/${cat.id}`} className="hidden md:inline text-muted hover:text-fg transition-colors truncate">{cat.label}</Link>}
            {cat && <ChevronRight className="hidden md:block h-3.5 w-3.5 text-faint shrink-0" />}
            <span className={cn('font-semibold text-fg truncate transition-opacity duration-240', !scrolled && 'max-md:opacity-0')}>{def.title}</span>
          </div>
          {/* Actions — ordinateur */}
          <div className="hidden lg:flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={onReset} title="Restaurer les valeurs par défaut"><RotateCcw /> Réinitialiser</Button>
            <span className="w-px h-5 bg-line mx-1" />
            <Button size="sm" onClick={onCopy} disabled={!doc}><Copy /> Copier</Button>
            <Button size="sm" onClick={onPDF} disabled={!doc}><FileDown /> Export PDF</Button>
            <Button size="sm" onClick={onShare}><Share2 /> Partager</Button>
            <Button size="sm" onClick={onSave}><Bookmark /> Enregistrer</Button>
          </div>
          {/* Actions — téléphone et tablette */}
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onReset} aria-label="Réinitialiser" title="Réinitialiser"><RotateCcw strokeWidth={1.75} /></Button>
          {favButton}
        </div>
      </div>

      <div className="px-4 md:px-8 lg:px-10 max-w-[1280px] mx-auto">
        {/* En-tête du simulateur */}
        <div className="flex items-start gap-3.5 md:gap-4 pt-2 md:pt-6 pb-6 md:pb-8 animate-fade-up">
          <IconTile icon={Icon} size="lg" active className="hidden sm:inline-flex mt-0.5" />
          <div className="min-w-0">
            {cat && <div className="text-[12.5px] font-medium text-muted mb-1">{cat.label}</div>}
            <h1 className="text-[26px] md:text-[32px] font-semibold tracking-[-0.028em] leading-[1.12] text-fg">{def.title}</h1>
            <p className="text-[14.5px] md:text-[15px] text-muted mt-2 leading-snug max-w-3xl">{def.description}</p>
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] lg:gap-8 xl:gap-10 lg:items-start">
          {/* Saisie */}
          <section aria-label="Paramètres de la simulation" className="space-y-4 animate-fade-up [animation-delay:60ms]">
            {def.customForm && def.customFormPosition === 'start' && def.customForm({ values, set })}
            {groups.map((g, gi) => (!g.visibleIf || g.visibleIf(values)) && (
              <FormCard key={gi} title={g.label}>
                <div className="grid gap-x-4 gap-y-5 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {g.fields.filter((f) => !f.visibleIf || f.visibleIf(values)).map((f) => (
                    <div key={f.key} className={cn('min-w-0', isWide(f) && 'md:col-span-2 lg:col-span-1 xl:col-span-2')}>
                      <FieldRenderer field={f} values={values} set={set} />
                    </div>
                  ))}
                </div>
              </FormCard>
            ))}
            {def.customForm && def.customFormPosition !== 'start' && def.customForm({ values, set })}
            <p className="text-[12px] text-muted px-1">Valeurs par défaut indicatives — à adapter à la situation étudiée.</p>
          </section>

          {/* Résultats (colonne collante sur grand écran) */}
          <section aria-label="Résultats" className="mt-8 lg:mt-0 lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-88px)] lg:overflow-y-auto lg:pb-6 lg:-mr-2 lg:pr-2 scrollbar-none animate-fade-up [animation-delay:120ms]">
            <div ref={resultsRef} className="space-y-3 scroll-mt-20" id="results" aria-live="polite">
              {!result.ok ? (
                <Card className="p-4 md:p-5 shadow-[inset_0_0_0_1px_rgb(var(--neg)/0.25)] bg-neg/[0.04]">
                  <div className="flex items-center gap-2 text-[13.5px] font-semibold text-neg mb-1.5"><AlertCircle className="h-4 w-4" strokeWidth={1.9} /> Calcul impossible</div>
                  <ul className="text-[13px] text-fg/80 space-y-1 list-disc pl-6 marker:text-neg/60">{result.errors.map((e, k) => <li key={k}>{e}</li>)}</ul>
                </Card>
              ) : (
                <>
                  <Headline report={result.value.report} fiscal={def.fiscal} />
                  <Metrics items={result.value.report.metrics} />
                  <Warnings items={result.value.report.warnings} />
                  {result.value.chart && <Card className="p-4 md:p-5">{result.value.chart}</Card>}
                  {result.value.extra}
                  {result.value.report.tables?.filter((t) => !t.pdfOnly).map((t, k) => <DataTable key={k} table={t} />)}
                  <CalculationDetails report={result.value.report} formula={def.formula} example={def.example} />
                  <p className="text-[11.5px] text-muted leading-snug px-1 pt-1">{def.fiscal ? DISCLAIMER_FISCAL : DISCLAIMER_INVEST}</p>
                </>
              )}
            </div>

            {/* Actions — téléphone et tablette */}
            <div className="lg:hidden grid grid-cols-2 md:grid-cols-4 gap-2 mt-5 no-print">
              <Button size="lg" onClick={onCopy} disabled={!doc}><Copy /> Copier</Button>
              <Button size="lg" onClick={onPDF} disabled={!doc}><FileDown /> Export PDF</Button>
              <Button size="lg" onClick={onShare}><Share2 /> Partager</Button>
              <Button size="lg" onClick={onSave}><Bookmark /> Enregistrer</Button>
              <Button size="lg" onClick={onReset} variant="ghost" className="col-span-2 md:col-span-4 text-muted"><RotateCcw /> Réinitialiser</Button>
            </div>
          </section>
        </div>
      </div>

      {/* Résultat flottant (téléphone et tablette) */}
      {result.ok && !resultsVisible && (
        <button
          onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="lg:hidden fixed left-3 right-3 z-30 mx-auto max-w-xl rounded-2xl bg-surface/90 backdrop-blur-xl shadow-lg hairline px-4 py-3 flex items-center justify-between gap-3 no-print animate-scale-in bottom-[calc(env(safe-area-inset-bottom)+64px)] md:bottom-6"
          aria-label={`${result.value.report.headline.label} : ${result.value.report.headline.value}. Voir les résultats`}
        >
          <span className="text-[12px] font-medium text-muted truncate text-left">{result.value.report.headline.label}</span>
          <span className="flex items-center gap-2 shrink-0">
            <span className="text-[17px] font-semibold tnum tracking-[-0.01em] text-fg"><LiveValue value={result.value.report.headline.value} /></span>
            <span className="h-6 w-6 rounded-full bg-accent text-accent-fg flex items-center justify-center"><ChevronDown className="h-3.5 w-3.5" strokeWidth={2.2} /></span>
          </span>
        </button>
      )}
      <Toast message={toast} />
      <span className="sr-only">{DISCLAIMER_INVEST}</span>
    </div>
  );
}

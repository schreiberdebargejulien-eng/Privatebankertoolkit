import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Check, ClipboardCopy, Crosshair, Download, Eye, EyeOff, FileUp, ListChecks, MapPin, MessageSquarePlus, Pencil, Power, RotateCcw, Trash2, Wrench, X,
} from 'lucide-react';
import { Badge, Button, Eyebrow } from '@/components/ui/primitives';
import { Segmented } from '@/components/ui/fields';
import { Toast, useToast } from '@/components/ui/Toast';
import { useSettings } from '@/lib/settings';
import { useStored } from '@/lib/store';
import { copyText } from '@/lib/report';
import { relativeTime } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import {
  KIND_LABELS, buildSelector, cleanRoute, commentsToJSON, commentsToMarkdown, describeElement, deviceLabel, getDevSimContext, mergeComments, parseCommentsJSON,
  type DevAnchor, type DevComment, type DevCommentKind,
} from '@/lib/devComments';

/* =========================================================================
 * Mode développeur (phase de test)
 *  - activation : Paramètres › Phase de test, ou lien `#/?dev=1` (`dev=0` pour désactiver) ;
 *  - « Commenter » : l'utilisateur touche un élément ; son emplacement (page, section, carte,
 *    champ, bouton…) est relevé et rattaché au commentaire ;
 *  - repères numérotés replacés sur les éléments commentés de la page courante ;
 *  - panneau : liste, résolution, export Markdown / JSON et import pour fusionner les retours.
 * Tout reste sur l'appareil ; rien n'est envoyé.
 * ========================================================================= */

/** Attribut des éléments propres au mode développeur : ignorés lors de la sélection. */
const DEV_UI = { 'data-dev-ui': '' };
const isDevUi = (el: Element | null) => !!el?.closest('[data-dev-ui]');

const KIND_OPTIONS = (Object.keys(KIND_LABELS) as DevCommentKind[]).map((k) => ({ value: k, label: KIND_LABELS[k] }));
const KIND_TONE: Record<DevCommentKind, 'neg' | 'accent' | 'warn' | 'muted'> = { bug: 'neg', suggestion: 'accent', question: 'warn', texte: 'muted' };

const newId = () => crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Recherche tolérante : un sélecteur obsolète ou invalide ne doit pas faire échouer l'écran. */
function findEl(selector?: string): Element | null {
  if (!selector) return null;
  try { return document.querySelector(selector); } catch { return null; }
}

/** Rafraîchit les positions (défilement, redimensionnement, contenu qui évolue). */
function useTick(active: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const bump = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => set((n) => n + 1)); };
    window.addEventListener('scroll', bump, { capture: true, passive: true });
    window.addEventListener('resize', bump);
    const iv = window.setInterval(bump, 700);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', bump, { capture: true }); window.removeEventListener('resize', bump); window.clearInterval(iv); };
  }, [active]);
}

const visibleRect = (el: Element | null) => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width === 0 && r.height === 0 ? null : r;
};

/** Point d'entrée : monté en permanence pour capter l'activation par lien. */
export function DevMode() {
  const { settings, update } = useSettings();
  const loc = useLocation();
  useEffect(() => {
    const p = new URLSearchParams(loc.search).get('dev');
    if (p === '1' && !settings.devMode) update({ devMode: true });
    if (p === '0' && settings.devMode) update({ devMode: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.search]);
  return settings.devMode ? <DevLayer /> : null;
}

interface Draft { anchor: DevAnchor; editingId?: string; text: string; kind: DevCommentKind; withReplay: boolean }

function DevLayer() {
  const { update, resolvedTheme } = useSettings();
  const loc = useLocation();
  const nav = useNavigate();
  const [comments, setComments] = useStored<DevComment[]>('dev.comments', []);
  const [author, setAuthor] = useStored<string>('dev.author', '');
  const [showPins, setShowPins] = useStored<boolean>('dev.pins', true);
  const [picking, setPicking] = useState(false);
  const [hover, setHover] = useState<Element | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [panel, setPanel] = useState<{ focusId?: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const { toast, show } = useToast();

  const route = cleanRoute(loc.pathname, loc.search);
  /** Commentaires de la page, du plus ancien au plus récent (numérotation stable des repères). */
  const pageComments = useMemo(() => comments.filter((c) => c.anchor.route === route).sort((a, b) => a.createdAt - b.createdAt), [comments, route]);
  const openCount = comments.filter((c) => c.status === 'open').length;

  useTick(showPins || picking || !!flash);

  const makeAnchor = useCallback((target: Element | null, clientX?: number, clientY?: number): DevAnchor => {
    const h1 = document.querySelector('main h1');
    const sim = getDevSimContext();
    let offset: DevAnchor['offset'];
    if (target && clientX !== undefined && clientY !== undefined) {
      const r = target.getBoundingClientRect();
      const clamp = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0.5));
      offset = { x: clamp((clientX - r.left) / r.width), y: clamp((clientY - r.top) / r.height) };
    }
    return {
      route,
      pageTitle: (h1?.textContent ?? document.title).replace(/\s+/g, ' ').trim().slice(0, 200),
      simId: loc.pathname.startsWith('/sim/') ? sim?.simId : undefined,
      path: target ? describeElement(target) : [],
      selector: target ? buildSelector(target, (s) => { try { return document.querySelectorAll(s).length === 1; } catch { return false; } }) : undefined,
      offset,
      device: deviceLabel(window.innerWidth),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      theme: resolvedTheme,
    };
  }, [route, loc.pathname, resolvedTheme]);

  const startDraft = useCallback((anchor: DevAnchor) => {
    setPicking(false);
    setHover(null);
    setDraft({ anchor, text: '', kind: 'bug', withReplay: !!anchor.simId });
  }, []);

  /* ---------- Sélection d'un élément ---------- */
  useEffect(() => {
    if (!picking) return;
    const target = (e: Event) => (e.target instanceof Element ? e.target : null);
    const onMove = (e: MouseEvent) => { const t = target(e); setHover(t && !isDevUi(t) ? t : null); };
    const block = (e: Event) => { if (!isDevUi(target(e))) { e.preventDefault(); e.stopPropagation(); } };
    const onClick = (e: MouseEvent) => {
      const t = target(e);
      if (!t || isDevUi(t)) return;
      e.preventDefault();
      e.stopPropagation();
      startDraft(makeAnchor(t, e.clientX, e.clientY));
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setPicking(false); setHover(null); } };
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mousedown', block, true);
    document.addEventListener('pointerdown', block, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    document.documentElement.classList.add('dev-picking');
    return () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mousedown', block, true);
      document.removeEventListener('pointerdown', block, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.classList.remove('dev-picking');
    };
  }, [picking, makeAnchor, startDraft]);

  /* ---------- Actions ---------- */
  const saveDraft = () => {
    if (!draft || !draft.text.trim()) return;
    const now = Date.now();
    const replayLink = draft.withReplay ? getDevSimContext()?.replayLink : undefined;
    if (draft.editingId) {
      setComments((all) => all.map((c) => (c.id === draft.editingId ? { ...c, text: draft.text.trim(), kind: draft.kind, updatedAt: now, author: c.author || author } : c)));
      show('Commentaire modifié');
    } else {
      const c: DevComment = { id: newId(), createdAt: now, updatedAt: now, author: author.trim(), kind: draft.kind, status: 'open', text: draft.text.trim(), anchor: draft.anchor, appVersion: __APP_VERSION__, replayLink };
      setComments((all) => [c, ...all].slice(0, 500));
      show('Commentaire enregistré');
    }
    setDraft(null);
  };
  const patch = (id: string, p: Partial<DevComment>) => setComments((all) => all.map((c) => (c.id === id ? { ...c, ...p, updatedAt: Date.now() } : c)));
  const remove = (id: string) => { if (window.confirm('Supprimer ce commentaire ?')) setComments((all) => all.filter((c) => c.id !== id)); };

  const goTo = (c: DevComment) => {
    if (c.anchor.route !== route) nav(c.anchor.route);
    setPanel(null);
    if (!c.anchor.selector) return;
    // Laisse la page (chargée à la demande) se rendre avant de chercher l'élément.
    let tries = 0;
    const seek = () => {
      const el = findEl(c.anchor.selector);
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setFlash(c.id); window.setTimeout(() => setFlash(null), 1800); }
      else if (++tries < 20) window.setTimeout(seek, 150);
      else show('Élément introuvable : la page a changé');
    };
    window.setTimeout(seek, 60);
  };

  const exportMd = async () => show((await copyText(commentsToMarkdown(comments))) ? 'Commentaires copiés (Markdown)' : 'Copie impossible');
  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([commentsToJSON(comments)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `commentaires-test-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importJson = async (file: File) => {
    try {
      const incoming = parseCommentsJSON(await file.text());
      const { merged, added, updated } = mergeComments(comments, incoming);
      setComments(merged);
      show(`${added} ajouté(s), ${updated} mis à jour`);
    } catch (e) { show(e instanceof Error ? e.message : 'Import impossible'); }
  };

  /* ---------- Rendu ---------- */
  const hoverRect = picking ? visibleRect(hover) : null;
  const flashed = flash ? comments.find((c) => c.id === flash) : undefined;
  const flashRect = flashed ? visibleRect(findEl(flashed.anchor.selector)) : null;

  return (
    <div {...DEV_UI} className="no-print">
      {/* Repères des commentaires de la page */}
      {showPins && !picking && pageComments.filter((c) => c.status === 'open').map((c) => {
        const r = visibleRect(findEl(c.anchor.selector));
        if (!r) return null;
        const n = pageComments.indexOf(c) + 1;
        const x = r.left + (c.anchor.offset?.x ?? 1) * r.width;
        const y = r.top + (c.anchor.offset?.y ?? 0) * r.height;
        if (y < -20 || y > window.innerHeight + 20) return null;
        return (
          <button
            key={c.id}
            onClick={() => setPanel({ focusId: c.id })}
            className={cn('fixed z-[45] -translate-x-1/2 -translate-y-1/2 h-6 min-w-6 px-1.5 rounded-full text-[11px] font-semibold tnum shadow-md ring-2 ring-surface transition-transform hover:scale-110',
              c.kind === 'bug' ? 'bg-neg text-white' : 'bg-accent text-accent-fg')}
            style={{ left: Math.min(window.innerWidth - 14, Math.max(14, x)), top: y }}
            title={`${KIND_LABELS[c.kind]} : ${c.text.slice(0, 80)}`}
            aria-label={`Commentaire ${n} : ${c.text.slice(0, 80)}`}
          >{n}</button>
        );
      })}

      {/* Surlignage de l'élément survolé ou retrouvé */}
      {(hoverRect || flashRect) && (
        <div
          className={cn('fixed z-[79] pointer-events-none rounded-md border-2 border-accent bg-accent/10 transition-[left,top,width,height] duration-100', flashRect && !hoverRect && 'animate-pulse')}
          style={{ left: (hoverRect ?? flashRect)!.left - 2, top: (hoverRect ?? flashRect)!.top - 2, width: (hoverRect ?? flashRect)!.width + 4, height: (hoverRect ?? flashRect)!.height + 4 }}
        />
      )}

      {/* Bandeau de sélection */}
      {picking && (
        <div className="fixed inset-x-0 top-0 z-[80] safe-top pointer-events-none">
          <div className="pointer-events-auto mx-auto mt-2 w-[calc(100%-16px)] max-w-xl rounded-2xl bg-fg text-bg shadow-lg px-3 py-2.5 flex flex-wrap items-center gap-2 animate-scale-in">
            <Crosshair className="h-4 w-4 shrink-0 opacity-80" strokeWidth={2} />
            <span className="flex-1 min-w-[180px] text-[13px] font-medium leading-snug">Touchez l’élément à commenter{hover ? <span className="opacity-60"> — {describeElement(hover).slice(-1)[0]}</span> : null}</span>
            <button className="h-8 px-3 rounded-lg bg-bg/15 hover:bg-bg/25 text-[12.5px] font-medium" onClick={() => startDraft(makeAnchor(null))}>Page entière</button>
            <button className="h-8 px-3 rounded-lg bg-bg/15 hover:bg-bg/25 text-[12.5px] font-medium" onClick={() => { setPicking(false); setHover(null); }}>Annuler</button>
          </div>
        </div>
      )}

      {/* Barre flottante */}
      {!picking && !draft && !panel && (
        <div className="fixed right-3 z-[65] bottom-[calc(env(safe-area-inset-bottom)+136px)] md:bottom-24 lg:bottom-6 flex items-center gap-1 rounded-full bg-surface/95 backdrop-blur-xl shadow-lg hairline p-1 animate-scale-in">
          <span className="hidden sm:inline-flex items-center gap-1 pl-2 pr-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-warn"><Wrench className="h-3.5 w-3.5" strokeWidth={2} /> Dev</span>
          <Button size="sm" variant="primary" className="rounded-full" onClick={() => setPicking(true)} title="Commenter un élément de la page"><MessageSquarePlus /> <span className="max-sm:sr-only">Commenter</span></Button>
          <Button size="sm" variant="ghost" className="rounded-full gap-1.5" onClick={() => setPanel({})} title="Tous les commentaires">
            <ListChecks /> <span className="tnum">{openCount}</span>
          </Button>
          <Button size="icon-sm" variant="ghost" className="rounded-full" onClick={() => setShowPins(!showPins)} aria-pressed={showPins} title={showPins ? 'Masquer les repères' : 'Afficher les repères'}>
            {showPins ? <Eye /> : <EyeOff />}
          </Button>
        </div>
      )}

      {draft && (
        <Composer
          draft={draft}
          setDraft={setDraft}
          author={author}
          setAuthor={setAuthor}
          canReplay={!draft.editingId && !!draft.anchor.simId && !!getDevSimContext()}
          onCancel={() => setDraft(null)}
          onSave={saveDraft}
          onRepick={draft.editingId ? undefined : () => { setDraft(null); setPicking(true); }}
        />
      )}

      {panel && (
        <Panel
          comments={comments}
          route={route}
          focusId={panel.focusId}
          author={author}
          setAuthor={setAuthor}
          onClose={() => setPanel(null)}
          onGo={goTo}
          onToggle={(c) => patch(c.id, { status: c.status === 'open' ? 'resolved' : 'open' })}
          onEdit={(c) => { setPanel(null); setDraft({ anchor: c.anchor, editingId: c.id, text: c.text, kind: c.kind, withReplay: false }); }}
          onRemove={remove}
          onExportMd={exportMd}
          onExportJson={exportJson}
          onImport={importJson}
          onClear={() => { if (window.confirm(`Supprimer les ${comments.length} commentaires de cet appareil ?`)) setComments([]); }}
          onDisable={() => { setPanel(null); update({ devMode: false }); }}
        />
      )}
      <Toast message={toast} />
    </div>
  );
}

/* ------------------------------ Emplacement ------------------------------ */
function Location({ anchor, compact }: { anchor: DevAnchor; compact?: boolean }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-1 text-[12px] leading-snug', compact ? 'text-muted' : 'text-fg/80')}>
      <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={1.9} />
      <span className="font-medium">{anchor.pageTitle || anchor.route}</span>
      {(anchor.path.length ? anchor.path : ['Page entière']).map((p, k) => (
        <span key={k} className="inline-flex items-center gap-1"><span className="text-faint">›</span><span>{p}</span></span>
      ))}
    </div>
  );
}

/* ------------------------------ Saisie d'un commentaire ------------------------------ */
const textareaCls = 'w-full rounded-[10px] bg-sunken border border-transparent px-3 py-2.5 text-[15px] leading-snug text-fg placeholder:text-faint outline-none transition-[background-color,border-color,box-shadow] duration-160 hover:border-line focus:bg-surface focus:border-accent/50 focus:shadow-focus resize-y';
const inputCls = 'w-full h-10 rounded-[10px] bg-sunken border border-transparent px-3 text-[15px] text-fg placeholder:text-faint outline-none hover:border-line focus:bg-surface focus:border-accent/50 focus:shadow-focus';

function Sheet({ label, onClose, children, wide }: { label: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[85] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-black/30 animate-fade-in" onClick={onClose} />
      <div className={cn('relative w-full max-h-[92vh] overflow-y-auto rounded-t-3xl md:rounded-2xl bg-surface shadow-lg p-4 md:p-5 safe-bottom animate-fade-up', wide ? 'md:max-w-2xl' : 'md:max-w-lg')}>
        {children}
      </div>
    </div>
  );
}

function Composer({ draft, setDraft, author, setAuthor, canReplay, onCancel, onSave, onRepick }: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  author: string;
  setAuthor: (a: string) => void;
  canReplay: boolean;
  onCancel: () => void;
  onSave: () => void;
  onRepick?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <Sheet label={draft.editingId ? 'Modifier le commentaire' : 'Nouveau commentaire'} onClose={onCancel}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[16px] font-semibold tracking-tight">{draft.editingId ? 'Modifier le commentaire' : 'Nouveau commentaire'}</h2>
        <Button size="icon-sm" variant="ghost" onClick={onCancel} aria-label="Fermer"><X /></Button>
      </div>
      <div className="rounded-xl bg-surface2 px-3 py-2.5 mb-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <Eyebrow>Emplacement</Eyebrow>
          {onRepick && <button className="text-[12px] font-medium text-accent hover:text-accent/80" onClick={onRepick}>Changer</button>}
        </div>
        <Location anchor={draft.anchor} />
        <div className="text-[11.5px] text-muted mt-1 tnum">#{draft.anchor.route} · {draft.anchor.device} {draft.anchor.viewport.w}×{draft.anchor.viewport.h}</div>
      </div>
      <div className="space-y-4">
        <Segmented<DevCommentKind> value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind })} options={KIND_OPTIONS} />
        <textarea
          ref={ref}
          className={textareaCls}
          rows={5}
          maxLength={5000}
          placeholder="Ce qui ne va pas, ce qui est attendu, ou votre suggestion…"
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(); } }}
          aria-label="Commentaire"
        />
        <label className="block space-y-1.5">
          <span className="block text-[13px] font-medium text-fg/75">Votre nom (testeur)</span>
          <input className={inputCls} value={author} maxLength={80} onChange={(e) => setAuthor(e.target.value)} placeholder="Facultatif" autoComplete="off" />
        </label>
        {canReplay && (
          <label className="flex items-start gap-2.5 text-[13px] text-fg/80 cursor-pointer">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" checked={draft.withReplay} onChange={(e) => setDraft({ ...draft, withReplay: e.target.checked })} />
            <span>Joindre un lien qui reproduit la simulation <span className="text-muted">(valeurs saisies, hors champs texte libres)</span></span>
          </label>
        )}
        <p className="text-[12px] text-muted leading-snug">Commentaire conservé sur cet appareil uniquement. N’y indiquez aucune donnée client.</p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel}>Annuler</Button>
          <Button variant="primary" onClick={onSave} disabled={!draft.text.trim()}><Check /> Enregistrer</Button>
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------ Panneau des commentaires ------------------------------ */
function Panel({ comments, route, focusId, author, setAuthor, onClose, onGo, onToggle, onEdit, onRemove, onExportMd, onExportJson, onImport, onClear, onDisable }: {
  comments: DevComment[];
  route: string;
  focusId?: string;
  author: string;
  setAuthor: (a: string) => void;
  onClose: () => void;
  onGo: (c: DevComment) => void;
  onToggle: (c: DevComment) => void;
  onEdit: (c: DevComment) => void;
  onRemove: (id: string) => void;
  onExportMd: () => void;
  onExportJson: () => void;
  onImport: (f: File) => void;
  onClear: () => void;
  onDisable: () => void;
}) {
  const page = comments.filter((c) => c.anchor.route === route);
  const [scope, setScope] = useState<'page' | 'all'>(focusId || page.length ? 'page' : 'all');
  const [showResolved, setShowResolved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = (scope === 'page' ? page : comments).filter((c) => showResolved || c.status === 'open' || c.id === focusId);

  useEffect(() => {
    if (focusId) document.getElementById(`dev-c-${focusId}`)?.scrollIntoView({ block: 'center' });
  }, [focusId]);

  return (
    <Sheet label="Commentaires de test" onClose={onClose} wide>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[16px] font-semibold tracking-tight">Commentaires de test</h2>
          <p className="text-[12.5px] text-muted">{comments.filter((c) => c.status === 'open').length} ouvert(s) · {comments.length} au total</p>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Fermer"><X /></Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex-1 min-w-[220px]">
          <Segmented value={scope} onChange={setScope} options={[{ value: 'page', label: `Cette page (${page.length})` }, { value: 'all', label: `Toutes (${comments.length})` }]} />
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-muted cursor-pointer">
          <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Afficher les résolus
        </label>
      </div>

      <div className="space-y-2">
        {list.length === 0 && <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">Aucun commentaire. Utilisez « Commenter » puis touchez un élément de l’écran.</div>}
        {list.map((c) => (
          <div key={c.id} id={`dev-c-${c.id}`} className={cn('rounded-xl hairline p-3 transition-colors', c.id === focusId && 'shadow-[inset_0_0_0_2px_rgb(var(--accent)/0.6)]', c.status === 'resolved' && 'opacity-60')}>
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <Badge tone={KIND_TONE[c.kind]}>{KIND_LABELS[c.kind]}</Badge>
              {c.status === 'resolved' && <Badge tone="pos"><Check className="h-3 w-3" /> Résolu</Badge>}
              <span className="text-[11.5px] text-muted">{c.author || 'Anonyme'} · {relativeTime(c.createdAt)}</span>
            </div>
            <p className="text-[13.5px] text-fg leading-snug whitespace-pre-wrap break-words">{c.text}</p>
            <div className="mt-2"><Location anchor={c.anchor} compact /></div>
            <div className="flex flex-wrap gap-1 mt-2 -ml-1.5">
              <Button size="sm" variant="ghost" onClick={() => onGo(c)}><MapPin /> Voir</Button>
              <Button size="sm" variant="ghost" onClick={() => onToggle(c)}>{c.status === 'open' ? <><Check /> Résoudre</> : <><RotateCcw /> Rouvrir</>}</Button>
              <Button size="sm" variant="ghost" onClick={() => onEdit(c)}><Pencil /> Modifier</Button>
              {c.replayLink && <Button size="sm" variant="ghost" onClick={() => { window.location.href = c.replayLink!; onClose(); }}>Reproduire</Button>}
              <Button size="sm" variant="ghost" className="text-neg" onClick={() => onRemove(c.id)} aria-label="Supprimer"><Trash2 /></Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-line space-y-3">
        <label className="block space-y-1.5">
          <span className="block text-[13px] font-medium text-fg/75">Votre nom (testeur)</span>
          <input className={inputCls} value={author} maxLength={80} onChange={(e) => setAuthor(e.target.value)} placeholder="Facultatif" autoComplete="off" />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button size="sm" onClick={onExportMd} disabled={!comments.length}><ClipboardCopy /> Copier (Markdown)</Button>
          <Button size="sm" onClick={onExportJson} disabled={!comments.length}><Download /> Exporter (JSON)</Button>
          <Button size="sm" onClick={() => fileRef.current?.click()}><FileUp /> Importer</Button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
        <div className="flex flex-wrap gap-2 justify-between">
          <Button size="sm" variant="ghost" onClick={onDisable}><Power /> Quitter le mode développeur</Button>
          <Button size="sm" variant="danger" onClick={onClear} disabled={!comments.length}><Trash2 /> Tout effacer</Button>
        </div>
      </div>
    </Sheet>
  );
}

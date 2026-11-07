import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, FileText, Info, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Card, Eyebrow } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import type { Report, ReportTable } from '@/simulators/types';
import { rulesFor } from '@/lib/report';
import { dateFR } from '@/lib/format';

/* =========================================================================
 * Blocs de résultat — rendu à l'écran du modèle `Report` (le même modèle
 * alimente la copie texte et le PDF : aucun contenu propre à l'écran ici).
 * ========================================================================= */

const toneClass = (t?: string) => (t === 'pos' ? 'text-pos' : t === 'neg' ? 'text-neg' : t === 'accent' ? 'text-accent' : t === 'muted' ? 'text-muted' : 'text-fg');

/** Compteur incrémenté à chaque changement de valeur (sert de clé d'animation). */
function useChangeTick(value: string) {
  const prev = useRef(value);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (prev.current !== value) { prev.current = value; setTick((t) => t + 1); }
  }, [value]);
  return tick;
}

/** Valeur qui se met en évidence brièvement lorsqu'elle change. */
export function LiveValue({ value, className, flash = false }: { value: string; className?: string; flash?: boolean }) {
  const tick = useChangeTick(value);
  return (
    <span key={tick} className={cn('inline-block', tick > 0 && (flash ? 'animate-value-flash rounded-[4px] -mx-1 px-1' : 'animate-value-in'), className)}>
      {value}
    </span>
  );
}

export function Headline({ report, fiscal }: { report: Report; fiscal?: boolean }) {
  const h = report.headline;
  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Eyebrow>{h.label}</Eyebrow>
        {fiscal && <Badge tone="muted" className="h-[18px] text-[10.5px]">Estimation</Badge>}
      </div>
      <div className={cn('mt-2.5 text-[34px] md:text-[40px] leading-[1.05] font-semibold tracking-[-0.03em] tnum break-words', toneClass(h.tone))}>
        <LiveValue value={h.value} />
      </div>
      {h.sub && <div className="mt-2.5 text-[13.5px] text-muted leading-snug">{h.sub}</div>}
    </Card>
  );
}

export function Metrics({ items }: { items: Report['metrics'] }) {
  if (!items.length) return null;
  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-line">
        {items.map((m, k) => (
          <div key={k} className="flex items-baseline justify-between gap-4 px-4 md:px-5 py-3">
            <div className="min-w-0">
              <div className="text-[13.5px] text-fg/75 leading-snug">{m.label}</div>
              {m.hint && <div className="text-[12px] text-muted mt-0.5 leading-snug">{m.hint}</div>}
            </div>
            <div className={cn('text-[15px] font-semibold tnum text-right shrink-0 tracking-[-0.01em]', toneClass(m.tone))}>
              <LiveValue value={m.value} flash />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function DataTable({ table }: { table: ReportTable }) {
  const limit = table.maxRowsInline ?? 12;
  const [all, setAll] = useState(false);
  const rows = all ? table.rows : table.rows.slice(0, limit);
  const align = (k: number) => ((table.align?.[k] ?? (k === 0 ? 'left' : 'right')) === 'left' ? 'text-left' : 'text-right');
  return (
    <Card className="overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 px-4 md:px-5 pt-4 pb-2.5">
        <div className="text-[14px] font-semibold tracking-tight text-fg">{table.title}</div>
        {table.rows.length > 1 && <div className="text-[12px] text-muted tnum shrink-0">{table.rows.length} lignes</div>}
      </div>
      <div className="overflow-x-auto scrollbar-none">
        <table className="w-full text-[12.5px] tnum">
          <thead>
            <tr className="text-muted">
              {table.columns.map((c, k) => (
                <th key={k} scope="col" className={cn('px-3 py-2 text-[11.5px] font-medium whitespace-nowrap border-y border-line bg-surface2/50', align(k), k === 0 && 'pl-4 md:pl-5 sticky left-0 bg-surface2 z-[1]', k === table.columns.length - 1 && 'pr-4 md:pr-5')}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line/70 last:border-0 hover:bg-surface2/40 transition-colors">
                {r.map((c, k) => (
                  <td key={k} className={cn('px-3 py-2 whitespace-nowrap text-fg/90', align(k), k === 0 && 'pl-4 md:pl-5 sticky left-0 bg-surface text-muted', k === r.length - 1 && 'pr-4 md:pr-5')}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.rows.length > limit && (
        <button className="w-full h-11 text-[13px] font-medium text-accent border-t border-line hover:bg-surface2/50 transition-colors" onClick={() => setAll(!all)}>
          {all ? 'Réduire' : `Afficher les ${table.rows.length} lignes`}
        </button>
      )}
    </Card>
  );
}

/** Ligne dépliable, ouverture animée (hauteur). */
export function Disclosure({ title, icon, children, defaultOpen = false, className }: { title: string; icon?: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={className}>
      <button className="w-full flex items-center gap-2.5 px-4 md:px-5 min-h-12 text-left hover:bg-surface2/40 transition-colors" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-muted [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
        <span className="flex-1 text-[13.5px] font-medium text-fg">{title}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted transition-transform duration-240 ease-apple', open && 'rotate-180')} />
      </button>
      <div className={cn('grid transition-[grid-template-rows] duration-240 ease-apple', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden" {...(open ? {} : { inert: '' })}>
          <div className="px-4 md:px-5 pb-4 text-[13px] text-muted leading-relaxed space-y-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Assumptions({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <Disclosure title="Hypothèses de calcul" icon={<Info strokeWidth={1.75} />} defaultOpen>
      <ul className="space-y-1.5 list-disc pl-4 marker:text-faint">{items.map((a, k) => <li key={k}>{a}</li>)}</ul>
    </Disclosure>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-2xl bg-warn/[0.07] shadow-[inset_0_0_0_1px_rgb(var(--warn)/0.22)] p-4 md:px-5">
      <div className="flex items-center gap-2 text-warn text-[13px] font-semibold mb-2"><AlertTriangle className="h-4 w-4" strokeWidth={1.9} /> Points d’attention</div>
      <ul className="space-y-1.5 text-[13px] text-fg/80 leading-snug list-disc pl-4 marker:text-warn/70">{items.map((w, k) => <li key={k}>{w}</li>)}</ul>
    </div>
  );
}

export function RulesUsed({ ids }: { ids?: string[] }) {
  const rules = rulesFor(ids);
  if (!rules.length) return null;
  return (
    <Disclosure title="Barèmes et sources officielles" icon={<ShieldCheck strokeWidth={1.75} />}>
      {rules.map((r) => (
        <div key={r.id} className="py-1.5">
          <div className="flex flex-wrap items-center gap-2 text-fg text-[13px] font-medium">
            {r.label}
            <Badge tone={r.status === 'official' ? 'pos' : r.status === 'cross-checked' ? 'accent' : 'warn'}>
              {r.status === 'official' ? 'Source officielle' : r.status === 'cross-checked' ? 'Recoupé' : 'À confirmer'}
            </Badge>
          </div>
          <div className="text-[12px] tnum">{r.scope} · en vigueur au {dateFR(r.effectiveFrom)} · vérifié le {dateFR(r.lastVerified)}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {r.sources.map((s) => <a key={s.url} className="text-[12px] text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent" href={s.url} target="_blank" rel="noreferrer noopener">{s.label}</a>)}
          </div>
          {r.notes?.map((n, k) => <div key={k} className="text-[12px] mt-1">— {n}</div>)}
        </div>
      ))}
      <Link to="/sources" className="inline-block text-[12px] text-accent font-medium pt-1">Tous les barèmes →</Link>
    </Disclosure>
  );
}

export function Method({ formula, example }: { formula: string[]; example: string }) {
  return (
    <Disclosure title="Méthode et formules" icon={<FileText strokeWidth={1.75} />}>
      <ul className="space-y-1.5">{formula.map((f, k) => <li key={k} className="font-mono text-[12px] leading-relaxed text-fg/80 bg-sunken rounded-lg px-2.5 py-1.5 overflow-x-auto">{f}</li>)}</ul>
      <div className="pt-1"><span className="text-fg font-medium">Exemple : </span>{example}</div>
    </Disclosure>
  );
}

/** Regroupe hypothèses, barèmes et méthode dans une seule surface. */
export function CalculationDetails({ report, formula, example }: { report: Report; formula: string[]; example: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-4 md:px-5 pt-4 pb-1"><Eyebrow>Détails du calcul</Eyebrow></div>
      <div className="divide-y divide-line">
        <Assumptions items={report.assumptions} />
        <RulesUsed ids={report.rules} />
        <Method formula={formula} example={example} />
      </div>
    </Card>
  );
}

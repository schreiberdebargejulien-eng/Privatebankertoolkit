import { useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, FileText, Info, ShieldCheck } from 'lucide-react';
import { Badge, Card } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import type { Report, ReportTable } from '@/simulators/types';
import { rulesFor } from '@/lib/report';
import { dateFR } from '@/lib/format';
import { Link } from 'react-router-dom';

const toneClass = (t?: string) => (t === 'pos' ? 'text-pos' : t === 'neg' ? 'text-neg' : t === 'accent' ? 'text-accent' : t === 'muted' ? 'text-muted' : 'text-fg');

export function Headline({ report, fiscal }: { report: Report; fiscal?: boolean }) {
  const h = report.headline;
  return (
    <Card className="relative overflow-hidden p-5 bg-night text-white border-night dark:bg-surface2 dark:border-line">
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold/10 blur-2xl" aria-hidden />
      <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.1em] text-gold">
        {h.label}
        {fiscal && <span className="rounded-full border border-gold/40 px-1.5 py-px text-[10px] normal-case tracking-normal">Estimation</span>}
      </div>
      <div className={cn('mt-2 text-[34px] leading-none font-semibold tracking-tight tnum', h.tone === 'neg' ? 'text-[#F0686E]' : h.tone === 'pos' ? 'text-[#4AC48C]' : 'text-white')}>{h.value}</div>
      {h.sub && <div className="mt-2 text-sm text-white/70 leading-snug">{h.sub}</div>}
    </Card>
  );
}

export function Metrics({ items }: { items: Report['metrics'] }) {
  if (!items.length) return null;
  return (
    <Card className="divide-y divide-line/70">
      {items.map((m, k) => (
        <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[14px] text-muted leading-snug">{m.label}</div>
            {m.hint && <div className="text-[11px] text-muted/70 mt-0.5">{m.hint}</div>}
          </div>
          <div className={cn('text-[15px] font-semibold tnum text-right shrink-0', toneClass(m.tone))}>{m.value}</div>
        </div>
      ))}
    </Card>
  );
}

export function DataTable({ table }: { table: ReportTable }) {
  const limit = table.maxRowsInline ?? 12;
  const [all, setAll] = useState(false);
  const rows = all ? table.rows : table.rows.slice(0, limit);
  return (
    <Card className="overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 text-[13px] font-semibold">{table.title}</div>
      <div className="overflow-x-auto scrollbar-none">
        <table className="w-full text-[12.5px] tnum">
          <thead>
            <tr className="text-muted">
              {table.columns.map((c, k) => (
                <th key={k} className={cn('px-3 py-2 font-medium whitespace-nowrap border-b border-line/70', (table.align?.[k] ?? (k === 0 ? 'left' : 'right')) === 'left' ? 'text-left' : 'text-right', k === 0 && 'pl-4 sticky left-0 bg-surface')}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line/40 last:border-0">
                {r.map((c, k) => (
                  <td key={k} className={cn('px-3 py-2 whitespace-nowrap', (table.align?.[k] ?? (k === 0 ? 'left' : 'right')) === 'left' ? 'text-left' : 'text-right', k === 0 && 'pl-4 sticky left-0 bg-surface text-muted')}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.rows.length > limit && (
        <button className="w-full py-3 text-[13px] font-medium text-accent border-t border-line/60" onClick={() => setAll(!all)}>
          {all ? 'Réduire' : `Afficher les ${table.rows.length} lignes`}
        </button>
      )}
    </Card>
  );
}

export function Disclosure({ title, icon, children, defaultOpen = false }: { title: string; icon?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button className="w-full flex items-center gap-2.5 px-4 min-h-12 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-accent">{icon}</span>
        <span className="flex-1 text-[14px] font-medium">{title}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted transition', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pb-4 text-[13.5px] text-muted leading-relaxed space-y-2">{children}</div>}
    </Card>
  );
}

export function Assumptions({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <Disclosure title="Hypothèses de calcul" icon={<Info className="h-4 w-4" />} defaultOpen>
      <ul className="space-y-1.5 list-disc pl-4 marker:text-accent">{items.map((a, k) => <li key={k}>{a}</li>)}</ul>
    </Disclosure>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <Card className="border-warn/30 bg-warn/[0.06] p-4">
      <div className="flex items-center gap-2 text-warn text-[13px] font-semibold mb-2"><AlertTriangle className="h-4 w-4" /> Points d’attention</div>
      <ul className="space-y-1.5 text-[13px] text-fg/80 leading-snug list-disc pl-4 marker:text-warn">{items.map((w, k) => <li key={k}>{w}</li>)}</ul>
    </Card>
  );
}

export function RulesUsed({ ids }: { ids?: string[] }) {
  const rules = rulesFor(ids);
  if (!rules.length) return null;
  return (
    <Disclosure title="Barèmes et sources officielles" icon={<ShieldCheck className="h-4 w-4" />}>
      {rules.map((r) => (
        <div key={r.id} className="py-1.5">
          <div className="flex flex-wrap items-center gap-2 text-fg text-[13.5px] font-medium">
            {r.label}
            <Badge tone={r.status === 'official' ? 'pos' : r.status === 'cross-checked' ? 'accent' : 'warn'}>
              {r.status === 'official' ? 'Source officielle' : r.status === 'cross-checked' ? 'Recoupé' : 'À confirmer'}
            </Badge>
          </div>
          <div className="text-[12px]">{r.scope} · en vigueur au {dateFR(r.effectiveFrom)} · vérifié le {dateFR(r.lastVerified)}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {r.sources.map((s) => <a key={s.url} className="text-[12px] text-accent underline underline-offset-2" href={s.url} target="_blank" rel="noreferrer noopener">{s.label}</a>)}
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
    <Disclosure title="Méthode et formules" icon={<FileText className="h-4 w-4" />}>
      <ul className="space-y-1.5">{formula.map((f, k) => <li key={k} className="font-mono text-[12px] leading-relaxed text-fg/80 bg-surface2/60 rounded-lg px-2.5 py-1.5">{f}</li>)}</ul>
      <div className="pt-1"><span className="text-fg font-medium">Exemple : </span>{example}</div>
    </Disclosure>
  );
}

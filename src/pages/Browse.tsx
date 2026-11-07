import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Info, Landmark, LineChart, Search, type LucideIcon } from 'lucide-react';
import { PageHeader, PAGE, PAGE_BOTTOM } from '@/components/layout/AppShell';
import { SearchBar } from '@/components/SearchBar';
import { SimList } from '@/components/SimList';
import { Card, EmptyState, IconTile, SectionTitle } from '@/components/ui/primitives';
import { byCategory, CATEGORIES, getMeta, searchSimulators, SIMULATORS, type SimMeta } from '@/simulators/catalog';
import type { CategoryId } from '@/simulators/types';
import { cn } from '@/lib/cn';

function NavRow({ to, icon, title, sub, count, className }: { to: string; icon: LucideIcon; title: string; sub: string; count?: number; className?: string }) {
  return (
    <Link to={to} className={cn('group flex items-center gap-3 px-3.5 py-3 min-h-[60px] transition-colors duration-160 hover:bg-surface2/60 active:bg-surface2', className)}>
      <IconTile icon={icon} />
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-fg leading-tight">{title}</div>
        <div className="text-[12.5px] text-muted truncate mt-[3px]">{sub}</div>
      </div>
      {count !== undefined && <span className="text-[12px] text-faint tnum">{count}</span>}
      <ChevronRight className="h-4 w-4 text-faint group-hover:text-muted group-hover:translate-x-0.5 transition" />
    </Link>
  );
}

export function CalculatorsPage() {
  const [q, setQ] = useState('');
  const results = useMemo(() => searchSimulators(q), [q]);
  return (
    <div className={PAGE_BOTTOM}>
      <PageHeader title="Bibliothèque" subtitle={`${SIMULATORS.length} simulateurs, classés par catégorie.`} />
      <div className={PAGE}>
        <SearchBar value={q} onChange={setQ} className="max-w-2xl" />
        {q ? (
          <div className="mt-6 animate-fade-in">
            {results.length ? <SimList items={results} /> : <EmptyState icon={Search} title={`Aucun simulateur ne correspond à « ${q} »`} />}
          </div>
        ) : (
          <div className="stagger">
            <SectionTitle className="mt-10">Espaces</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              <SpaceCard to="/investissements" icon={LineChart} title="Investissements" sub="Structurés, obligations, allocation, placements et levier" />
              <SpaceCard to="/patrimoine" icon={Landmark} title="Patrimoine" sub="Projection, transmission et fiscalité patrimoniale" />
            </div>
            <SectionTitle>Catégories</SectionTitle>
            <Card className="overflow-hidden">
              <div className="grid lg:grid-cols-2">
                {CATEGORIES.map((c, k) => (
                  <NavRow key={c.id} to={`/calculateurs/${c.id}`} icon={c.icon} title={c.label} sub={c.description} count={byCategory(c.id).length}
                    className={cn('border-line', k > 0 && 'border-t', k === 1 && 'lg:border-t-0', k % 2 === 1 && 'lg:border-l')} />
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function SpaceCard({ to, icon: Icon, title, sub }: { to: string; icon: LucideIcon; title: string; sub: string }) {
  return (
    <Link to={to} className="group rounded-2xl bg-surface hairline shadow-xs p-4 flex items-center gap-3.5 transition-[box-shadow,transform] duration-240 ease-apple hover:shadow-md active:scale-[0.99]">
      <span className="h-10 w-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0"><Icon className="h-5 w-5" strokeWidth={1.75} /></span>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold tracking-tight text-fg">{title}</div>
        <div className="text-[12.5px] text-muted mt-0.5 leading-snug">{sub}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-faint group-hover:translate-x-0.5 transition" />
    </Link>
  );
}

export function CategoryPage() {
  const { id } = useParams();
  const cat = CATEGORIES.find((c) => c.id === id);
  if (!cat) return <div className={cn(PAGE, 'safe-top pt-10 text-muted')}>Catégorie introuvable. <Link to="/calculateurs" className="text-accent">Bibliothèque</Link></div>;
  const items = byCategory(cat.id as CategoryId);
  return (
    <div className={PAGE_BOTTOM}>
      <PageHeader back={{ to: '/calculateurs', label: 'Bibliothèque' }} title={cat.label} subtitle={cat.description} eyebrow={`${items.length} simulateur${items.length > 1 ? 's' : ''}`} />
      <div className={PAGE}>
        <SimList items={items} />
        {cat.id === 'entreprise' && (
          <p className="flex gap-2 text-[12.5px] text-muted mt-4 leading-snug max-w-3xl"><Info className="h-4 w-4 shrink-0 mt-px" strokeWidth={1.75} />Simulateurs spécifiques prévus dans une version ultérieure : arbitrage rémunération / dividendes, pacte Dutreil, apport-cession (150-0 B ter). Ils exigent une modélisation des cotisations sociales et des régimes d’exonération qui n’est pas encore intégrée de manière fiable.</p>
        )}
      </div>
    </div>
  );
}

function SectionPage({ title, subtitle, groups }: { title: string; subtitle: string; groups: { label: string; ids: string[] }[] }) {
  return (
    <div className={PAGE_BOTTOM}>
      <PageHeader title={title} subtitle={subtitle} />
      <div className={cn(PAGE, 'stagger')}>
        {groups.map((g, k) => (
          <section key={g.label}>
            <SectionTitle className={k === 0 ? 'mt-0' : undefined}>{g.label}</SectionTitle>
            <SimList items={g.ids.map(getMeta).filter(Boolean) as SimMeta[]} />
          </section>
        ))}
      </div>
    </div>
  );
}

export function InvestmentsPage() {
  return (
    <SectionPage title="Investissements" subtitle="Structurés, obligations, allocation et placements" groups={[
      { label: 'Produits structurés', ids: ['structured', 'scenarios'] },
      { label: 'Obligations', ids: ['bond'] },
      { label: 'Allocation et placements', ids: ['allocation', 'compare', 'cat', 'net-yield', 'cap-vs-dist', 'income', 'xirr'] },
      { label: 'Levier', ids: ['lombard'] },
    ]} />
  );
}

export function WealthPage() {
  return (
    <SectionPage title="Patrimoine" subtitle="Projection, transmission et fiscalité patrimoniale" groups={[
      { label: 'Projection', ids: ['projection', 'withdrawal', 'income'] },
      { label: 'Transmission', ids: ['succession', 'donation', 'demembrement'] },
      { label: 'Fiscalité du patrimoine', ids: ['ifi', 'assurance-vie', 'per'] },
    ]} />
  );
}

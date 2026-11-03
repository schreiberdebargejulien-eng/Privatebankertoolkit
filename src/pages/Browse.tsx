import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { PageHeader, PAGE } from '@/components/layout/AppShell';
import { SearchBar } from '@/components/SearchBar';
import { SimList } from '@/components/SimList';
import { Button, Card, SectionTitle } from '@/components/ui/primitives';
import { byCategory, bySection, CATEGORIES, getMeta, searchSimulators, type SimMeta } from '@/simulators/catalog';
import type { CategoryId } from '@/simulators/types';

export function CalculatorsPage() {
  const [q, setQ] = useState('');
  const results = useMemo(() => searchSimulators(q), [q]);
  return (
    <div className="pb-28 lg:pb-12">
      <PageHeader title="Calculateurs" subtitle="Bibliothèque par catégorie" />
      <div className={`${PAGE} space-y-4`}>
        <SearchBar value={q} onChange={setQ} />
        {q ? <SimList items={results} /> : (
          <Card className="overflow-hidden"><div className="grid gap-px bg-line/60 lg:grid-cols-2">
            {CATEGORIES.map((c) => (
              <Link key={c.id} to={`/calculateurs/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 bg-surface active:bg-surface2/70 lg:hover:bg-surface2/50">
                <div className="h-10 w-10 rounded-xl bg-night text-gold flex items-center justify-center dark:bg-surface2"><c.icon className="h-[19px] w-[19px]" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium">{c.label}</div>
                  <div className="text-[12.5px] text-muted truncate">{c.description}</div>
                </div>
                <span className="text-[12px] text-muted tnum">{byCategory(c.id).length}</span>
                <ChevronRight className="h-4 w-4 text-muted/60" />
              </Link>
            ))}
            <div className="hidden lg:block bg-surface" />
          </div></Card>
        )}
      </div>
    </div>
  );
}

export function CategoryPage() {
  const { id } = useParams();
  const cat = CATEGORIES.find((c) => c.id === id);
  if (!cat) return <div className="p-6">Catégorie introuvable.</div>;
  return (
    <div className="pb-28 lg:pb-12">
      <div className="safe-top px-2 pt-2"><Link to="/calculateurs"><Button variant="ghost" size="sm" tabIndex={-1}><ArrowLeft className="h-4 w-4" /> Catégories</Button></Link></div>
      <PageHeader title={cat.label} subtitle={cat.description} />
      <div className={PAGE}>
        <SimList items={byCategory(cat.id as CategoryId)} />
        {cat.id === 'entreprise' && (
          <p className="text-[12px] text-muted mt-3 px-1 leading-snug">Simulateurs spécifiques prévus dans une version ultérieure : arbitrage rémunération / dividendes, pacte Dutreil, apport-cession (150-0 B ter). Ils exigent une modélisation des cotisations sociales et des régimes d’exonération qui n’est pas encore intégrée de manière fiable.</p>
        )}
      </div>
    </div>
  );
}

function SectionPage({ title, subtitle, groups }: { title: string; subtitle: string; groups: { label: string; ids: string[] }[] }) {
  return (
    <div className="pb-28 lg:pb-12">
      <PageHeader title={title} subtitle={subtitle} />
      <div className={PAGE}>
        {groups.map((g) => (
          <div key={g.label}>
            <SectionTitle>{g.label}</SectionTitle>
            <SimList items={g.ids.map(getMeta).filter(Boolean) as SimMeta[]} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function InvestmentsPage() {
  void bySection;
  return (
    <SectionPage title="Investissements" subtitle="Structurés, obligations, allocation et placements" groups={[
      { label: 'Produits structurés', ids: ['autocall', 'phoenix', 'reverse-convertible', 'scenarios'] },
      { label: 'Obligations', ids: ['bond'] },
      { label: 'Allocation et placements', ids: ['allocation', 'compare', 'net-yield', 'cap-vs-dist', 'income', 'xirr'] },
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

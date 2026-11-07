import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, History, Search, ShieldCheck, WifiOff } from 'lucide-react';
import { SearchBar } from '@/components/SearchBar';
import { PageHeader, PAGE, PAGE_BOTTOM } from '@/components/layout/AppShell';
import { SimList } from '@/components/SimList';
import { Card, EmptyState, IconTile, SectionTitle } from '@/components/ui/primitives';
import { FAMILIES, getMeta, searchSimulators, SIMULATORS, type SimMeta } from '@/simulators/catalog';
import { useFavorites, useRecents } from '@/lib/store';
import { relativeTime } from '@/lib/hooks';
import { cn } from '@/lib/cn';

const QUICK = ['lombard', 'ir', 'assurance-vie', 'structured', 'xirr', 'donation', 'mortgage', 'bond'];
const SHORTCUTS = [
  { label: 'Calculer un impôt', ids: ['ir', 'ifi'] },
  { label: 'Financer', ids: ['lombard', 'mortgage', 'in-fine'] },
  { label: 'Transmettre', ids: ['donation', 'succession', 'demembrement'] },
];

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Bonsoir' : h < 18 ? 'Bonjour' : 'Bonsoir';
}

const metas = (ids: string[]) => (ids.map(getMeta).filter(Boolean) as SimMeta[]).filter((m, k, a) => a.findIndex((x) => x.id === m.id) === k);

export function HomePage() {
  const [q, setQ] = useState('');
  const results = useMemo(() => searchSimulators(q), [q]);
  const { favorites } = useFavorites();
  const { recents, usage } = useRecents();
  const mostUsed = Object.entries(usage).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const recentAt = Object.fromEntries(recents.map((r) => [r.id, r.at]));

  return (
    <div className={PAGE_BOTTOM}>
      <PageHeader
        eyebrow={`${today.charAt(0).toUpperCase()}${today.slice(1)}`}
        title={greeting()}
        subtitle={`${SIMULATORS.length} simulateurs financiers, fiscaux et patrimoniaux, prêts pour vos rendez-vous.`}
      />
      <div className={PAGE}>
        <SearchBar value={q} onChange={setQ} size="lg" className="max-w-2xl" />

        {q ? (
          <div className="mt-6 animate-fade-in">
            <div className="text-[13px] text-muted mb-2.5 tnum">{results.length} résultat{results.length > 1 ? 's' : ''}</div>
            {results.length ? <SimList items={results} /> : <EmptyState icon={Search} title={`Aucun simulateur ne correspond à « ${q} »`}>Essayez un terme plus général : « crédit », « impôt », « rendement »…</EmptyState>}
          </div>
        ) : (
          <div className="stagger [&>*]:min-w-0">
            {/* Favoris & récents */}
            <div className="grid gap-x-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] [&>*]:min-w-0">
              <section>
                {favorites.length > 0 ? (
                  <>
                    <SectionTitle action={<Link to="/favoris" className="font-medium text-accent hover:text-accent/80">Gérer</Link>}>Favoris</SectionTitle>
                    <SimList items={metas(favorites.slice(0, 6))} columns={1} />
                  </>
                ) : (
                  <>
                    <SectionTitle description="Touchez l’étoile d’un outil pour l’épingler ici.">Accès rapide</SectionTitle>
                    <SimList items={metas(QUICK.slice(0, 6))} columns={1} />
                  </>
                )}
              </section>
              <section>
                <SectionTitle action={recents.length ? <Link to="/favoris" className="font-medium text-accent hover:text-accent/80">Historique</Link> : undefined}>Récemment utilisés</SectionTitle>
                {recents.length ? (
                  <SimList items={metas(recents.slice(0, 5).map((r) => r.id))} columns={1} meta={(s) => recentAt[s.id] ? relativeTime(recentAt[s.id]) : null} />
                ) : (
                  <EmptyState icon={History} title="Aucun outil consulté">Vos derniers simulateurs apparaîtront ici.</EmptyState>
                )}
                {mostUsed.length > 1 && (
                  <div className="mt-5">
                    <div className="text-[12px] font-medium text-muted mb-2">Les plus utilisés</div>
                    <div className="flex flex-wrap gap-1.5">
                      {metas(mostUsed).map((m) => <Chip key={m.id} to={`/sim/${m.id}`} icon={m.icon}>{m.title}</Chip>)}
                    </div>
                  </div>
                )}
              </section>
            </div>

            {/* Parcours */}
            <section>
              <SectionTitle description="Les enchaînements les plus fréquents en rendez-vous.">Parcours</SectionTitle>
              <div className="grid gap-3 md:grid-cols-3">
                {SHORTCUTS.map((sc) => (
                  <Card key={sc.label} className="p-4">
                    <div className="text-[13.5px] font-semibold text-fg mb-3">{sc.label}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {metas(sc.ids).map((m) => <Chip key={m.id} to={`/sim/${m.id}`} icon={m.icon}>{m.title}</Chip>)}
                    </div>
                  </Card>
                ))}
              </div>
            </section>

            {/* Tous les outils, par famille */}
            <section>
              <SectionTitle description={`${SIMULATORS.length} simulateurs répartis en ${FAMILIES.length} familles.`} action={<Link to="/calculateurs" className="font-medium text-accent hover:text-accent/80 inline-flex items-center gap-1">Bibliothèque <ArrowRight className="h-3.5 w-3.5" /></Link>}>Tous les outils</SectionTitle>
              <div className="-mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto scrollbar-none">
                <div className="flex md:flex-wrap gap-1.5 w-max md:w-auto pb-1">
                  {FAMILIES.map((f) => (
                    <button key={f.id} onClick={() => document.getElementById(`famille-${f.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="inline-flex items-center gap-1.5 h-8 pl-2.5 pr-3 rounded-full bg-surface hairline shadow-xs text-[13px] font-medium text-fg/80 hover:text-fg hover:bg-surface2 transition-colors whitespace-nowrap">
                      <f.icon className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} /> {f.label} <span className="text-faint tnum">{f.items.length}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-x-8 gap-y-10 md:grid-cols-2 mt-8 [&>*]:min-w-0">
                {FAMILIES.map((f) => (
                  <div key={f.id} id={`famille-${f.id}`} className="scroll-mt-6">
                    <div className="flex items-center gap-3 mb-3">
                      <IconTile icon={f.icon} size="sm" />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[15px] font-semibold tracking-tight text-fg leading-tight">{f.label}</h3>
                        <p className="text-[12.5px] text-muted truncate">{f.description}</p>
                      </div>
                      <Link to={`/calculateurs/${f.id}`} className="text-[12.5px] font-medium text-accent hover:text-accent/80 shrink-0">Voir</Link>
                    </div>
                    <SimList items={f.items} columns={1} />
                  </div>
                ))}
              </div>
            </section>

            <div className="mt-14 flex flex-col sm:flex-row gap-3 sm:items-center justify-between border-t border-line pt-6 text-[12.5px] text-muted">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-pos shrink-0" strokeWidth={1.75} /> Calculs 100 % locaux — aucune donnée transmise ni conservée automatiquement. Aucun nom de client n’est demandé.</span>
              <span className="flex items-center gap-2 shrink-0"><WifiOff className="h-4 w-4 shrink-0" strokeWidth={1.75} /> Fonctionne hors connexion</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ to, icon: Icon, children, className }: { to: string; icon: SimMeta['icon']; children: React.ReactNode; className?: string }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-1.5 h-8 rounded-full bg-surface2 px-3 text-[13px] font-medium text-fg/85 hover:text-fg hover:bg-line/70 active:scale-[0.97] transition', className)}>
      <Icon className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} /> {children}
    </Link>
  );
}

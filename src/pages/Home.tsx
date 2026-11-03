import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings as SettingsIcon, ShieldCheck, WifiOff } from 'lucide-react';
import { PageHeader, PAGE } from '@/components/layout/AppShell';
import { SearchBar } from '@/components/SearchBar';
import { SimList, SimTiles } from '@/components/SimList';
import { SectionTitle, Button, Card } from '@/components/ui/primitives';
import { getMeta, searchSimulators, SIMULATORS, type SimMeta } from '@/simulators/catalog';
import { useFavorites, useRecents } from '@/lib/store';

const QUICK = ['lombard', 'ir', 'assurance-vie', 'autocall', 'xirr', 'donation', 'mortgage', 'bond'];
const SHORTCUTS = [
  { label: 'Calculer un impôt', ids: ['ir', 'ifi'] },
  { label: 'Financer', ids: ['lombard', 'mortgage', 'in-fine'] },
  { label: 'Transmettre', ids: ['donation', 'succession', 'demembrement'] },
];

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Bonsoir' : h < 18 ? 'Bonjour' : 'Bonsoir';
}

export function HomePage() {
  const [q, setQ] = useState('');
  const results = useMemo(() => searchSimulators(q), [q]);
  const { favorites } = useFavorites();
  const { recents, usage } = useRecents();
  const metas = (ids: string[]) => ids.map(getMeta).filter(Boolean) as SimMeta[];
  const mostUsed = Object.entries(usage).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="pb-28 lg:pb-12">
      <PageHeader
        title={greeting()}
        subtitle={`${today.charAt(0).toUpperCase()}${today.slice(1)} · ${SIMULATORS.length} simulateurs disponibles`}
        right={<Link to="/parametres" aria-label="Paramètres" className="lg:hidden"><Button variant="secondary" size="icon" tabIndex={-1}><SettingsIcon className="h-5 w-5" /></Button></Link>}
      />
      <div className={PAGE}>
        <SearchBar value={q} onChange={setQ} />

        {q ? (
          <div className="mt-4">
            {results.length ? <SimList items={results} /> : <Card className="p-6 text-center text-[14px] text-muted">Aucun simulateur ne correspond à « {q} ».</Card>}
          </div>
        ) : (
          <>
            <SectionTitle>Accès rapide</SectionTitle>
            <SimTiles items={metas(QUICK)} />

            {recents.length > 0 && (
              <>
                <SectionTitle action={<Link to="/favoris" className="text-[13px] text-accent font-medium">Tout voir</Link>}>Récemment utilisés</SectionTitle>
                <SimList items={metas(recents.slice(0, 4).map((r) => r.id))} />
              </>
            )}

            {favorites.length > 0 && (
              <>
                <SectionTitle>Favoris</SectionTitle>
                <SimList items={metas(favorites.slice(0, 6))} />
              </>
            )}

            {mostUsed.length > 1 && (
              <>
                <SectionTitle>Les plus utilisés</SectionTitle>
                <SimList items={metas(mostUsed)} />
              </>
            )}

            <SectionTitle>Raccourcis</SectionTitle>
            <div className="grid gap-2.5 lg:grid-cols-3">
              {SHORTCUTS.map((sc) => (
                <Card key={sc.label} className="p-3.5">
                  <div className="text-[13px] font-semibold mb-2.5">{sc.label}</div>
                  <div className="flex flex-wrap gap-2">
                    {metas(sc.ids).map((m) => (
                      <Link key={m.id} to={`/sim/${m.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-surface2 px-3 h-9 text-[13px] font-medium active:scale-[0.97] transition">
                        <m.icon className="h-3.5 w-3.5 text-accent" /> {m.title}
                      </Link>
                    ))}
                  </div>
                </Card>
              ))}
            </div>

            <Card className="mt-6 p-4 flex gap-3 items-start">
              <ShieldCheck className="h-5 w-5 text-accent shrink-0 mt-0.5" />
              <div className="text-[12.5px] text-muted leading-snug">
                <span className="text-fg font-medium">Confidentialité : calculs 100 % locaux.</span> Aucune donnée n’est transmise ni conservée automatiquement. Aucun nom de client n’est demandé.
                <span className="flex items-center gap-1.5 mt-1.5"><WifiOff className="h-3.5 w-3.5" /> Fonctionne hors connexion une fois installée.</span>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { Trash2, Star, History, Bookmark } from 'lucide-react';
import { PageHeader, PAGE } from '@/components/layout/AppShell';
import { SimList, SimRow } from '@/components/SimList';
import { Button, Card, SectionTitle } from '@/components/ui/primitives';
import { getMeta, type SimMeta } from '@/simulators/catalog';
import { cn } from '@/lib/cn';
import { useFavorites, useRecents, useScenarios } from '@/lib/store';

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <Card className="p-5 flex items-center gap-3 text-[13.5px] text-muted"><span className="text-accent">{icon}</span>{text}</Card>;
}

export function FavoritesPage() {
  const { favorites, toggle } = useFavorites();
  const { recents, clear } = useRecents();
  const { scenarios, remove, clear: clearScenarios } = useScenarios();
  const metas = (ids: string[]) => (ids.map(getMeta).filter(Boolean) as SimMeta[]).filter((m, k, a) => a.findIndex((x) => x.id === m.id) === k);
  return (
    <div className="pb-28 lg:pb-12">
      <PageHeader title="Favoris" subtitle="Vos outils et scénarios, sur cet appareil uniquement" />
      <div className={cn(PAGE, 'lg:max-w-4xl')}>
        <SectionTitle>Simulateurs favoris</SectionTitle>
        {favorites.length ? (
          <Card className="divide-y divide-line/60 overflow-hidden">
            {metas(favorites).map((m) => (
              <SimRow key={m.id} s={m} right={<button onClick={(e) => { e.preventDefault(); toggle(m.id); }} className="h-9 w-9 flex items-center justify-center" aria-label={`Retirer ${m.title} des favoris`}><Star className="h-4 w-4 fill-gold text-gold" /></button>} />
            ))}
          </Card>
        ) : <Empty icon={<Star className="h-5 w-5" />} text="Touchez l’étoile d’un simulateur pour l’ajouter ici." />}

        <SectionTitle action={recents.length ? <button className="text-[13px] text-accent font-medium" onClick={clear}>Effacer</button> : undefined}>Derniers utilisés</SectionTitle>
        {recents.length ? <SimList items={metas(recents.map((r) => r.id))} /> : <Empty icon={<History className="h-5 w-5" />} text="Aucun simulateur consulté récemment." />}

        <SectionTitle action={scenarios.length ? <button className="text-[13px] text-neg font-medium" onClick={() => window.confirm('Supprimer tous les scénarios enregistrés ?') && clearScenarios()}>Tout supprimer</button> : undefined}>Scénarios enregistrés</SectionTitle>
        {scenarios.length ? (
          <Card className="divide-y divide-line/60 overflow-hidden">
            {scenarios.map((s) => {
              const m = getMeta(s.simId);
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <Link to={`/sim/${s.simId}?scenario=${s.id}`} className="flex-1 min-w-0">
                    <div className="text-[14.5px] font-medium truncate">{s.label}</div>
                    <div className="text-[12px] text-muted">{m?.title} · {new Date(s.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</div>
                  </Link>
                  <Button variant="ghost" size="icon" onClick={() => remove(s.id)} aria-label="Supprimer le scénario"><Trash2 className="h-4 w-4 text-muted" /></Button>
                </div>
              );
            })}
          </Card>
        ) : <Empty icon={<Bookmark className="h-5 w-5" />} text="Aucun scénario. Utilisez « Enregistrer » dans un simulateur : les données restent sur cet appareil." />}
      </div>
    </div>
  );
}

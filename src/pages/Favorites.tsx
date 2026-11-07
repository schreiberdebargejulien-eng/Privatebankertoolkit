import { Link } from 'react-router-dom';
import { Trash2, Star, History, Bookmark, ChevronRight } from 'lucide-react';
import { PageHeader, PAGE, PAGE_BOTTOM } from '@/components/layout/AppShell';
import { SimList } from '@/components/SimList';
import { Button, Card, EmptyState, IconTile, SectionTitle, TextAction } from '@/components/ui/primitives';
import { getMeta, type SimMeta } from '@/simulators/catalog';
import { relativeTime } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { useFavorites, useRecents, useScenarios } from '@/lib/store';

export function FavoritesPage() {
  const { favorites } = useFavorites();
  const { recents, clear } = useRecents();
  const { scenarios, remove, clear: clearScenarios } = useScenarios();
  const metas = (ids: string[]) => (ids.map(getMeta).filter(Boolean) as SimMeta[]).filter((m, k, a) => a.findIndex((x) => x.id === m.id) === k);
  const recentAt = Object.fromEntries(recents.map((r) => [r.id, r.at]));
  return (
    <div className={PAGE_BOTTOM}>
      <PageHeader title="Favoris" subtitle="Vos outils et scénarios, sur cet appareil uniquement." />
      <div className={cn(PAGE, 'max-w-[880px] stagger')}>
        <section>
          <SectionTitle className="mt-0" description={favorites.length ? `${favorites.length} outil${favorites.length > 1 ? 's' : ''} épinglé${favorites.length > 1 ? 's' : ''}` : undefined}>Simulateurs favoris</SectionTitle>
          {favorites.length ? <SimList items={metas(favorites)} columns={1} /> : <EmptyState icon={Star} title="Aucun favori">Touchez l’étoile d’un simulateur pour l’ajouter ici.</EmptyState>}
        </section>

        <section>
          <SectionTitle action={recents.length ? <TextAction onClick={clear}>Effacer</TextAction> : undefined}>Derniers utilisés</SectionTitle>
          {recents.length ? <SimList items={metas(recents.map((r) => r.id))} columns={1} meta={(s) => recentAt[s.id] ? relativeTime(recentAt[s.id]) : null} /> : <EmptyState icon={History} title="Aucun simulateur consulté récemment" />}
        </section>

        <section>
          <SectionTitle description="Enregistrés sur action explicite, sans nom de client." action={scenarios.length ? <TextAction className="text-neg hover:text-neg/80" onClick={() => window.confirm('Supprimer tous les scénarios enregistrés ?') && clearScenarios()}>Tout supprimer</TextAction> : undefined}>Scénarios enregistrés</SectionTitle>
          {scenarios.length ? (
            <Card className="overflow-hidden divide-y divide-line">
              {scenarios.map((s) => {
                const m = getMeta(s.simId);
                return (
                  <div key={s.id} className="group relative flex items-center gap-3 px-3.5 py-2.5 min-h-[56px] hover:bg-surface2/60 transition-colors">
                    {m ? <IconTile icon={m.icon} /> : <IconTile icon={Bookmark} />}
                    <div className="flex-1 min-w-0">
                      <Link to={`/sim/${s.simId}?scenario=${s.id}`} className="block text-[14px] font-medium text-fg truncate outline-none after:absolute after:inset-0">{s.label}</Link>
                      <div className="text-[12.5px] text-muted truncate mt-[3px]">{m?.title} · {new Date(s.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} <span className="text-faint">· {relativeTime(s.savedAt)}</span></div>
                    </div>
                    <Button variant="ghost" size="icon-sm" className="relative z-10 text-muted hover:text-neg" onClick={() => remove(s.id)} aria-label="Supprimer le scénario"><Trash2 /></Button>
                    <ChevronRight className="h-4 w-4 text-faint -ml-1 md:hidden" />
                  </div>
                );
              })}
            </Card>
          ) : <EmptyState icon={Bookmark} title="Aucun scénario">Utilisez « Enregistrer » dans un simulateur : les données restent sur cet appareil.</EmptyState>}
        </section>
      </div>
    </div>
  );
}

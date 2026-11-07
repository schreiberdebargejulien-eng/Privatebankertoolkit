import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Star } from 'lucide-react';
import type { SimMeta } from '@/simulators/catalog';
import { Card, IconTile } from '@/components/ui/primitives';
import { useFavorites } from '@/lib/store';
import { cn } from '@/lib/cn';

/** Étoile de favori : visible au survol sur ordinateur, toujours sur écran tactile ou si active. */
export function FavoriteButton({ id, title, className }: { id: string; title: string; className?: string }) {
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(id);
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(id); }}
      aria-pressed={fav}
      aria-label={fav ? `Retirer ${title} des favoris` : `Ajouter ${title} aux favoris`}
      title={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      className={cn('h-8 w-8 shrink-0 flex items-center justify-center rounded-md transition-[opacity,color,background-color] duration-160 hover:bg-surface2',
        fav ? 'text-accent' : 'text-faint hover:text-fg reveal-on-hover', className)}
    >
      <Star className={cn('h-4 w-4', fav && 'fill-current')} strokeWidth={1.75} />
    </button>
  );
}

/** Ligne d'outil : icône, nom, description, favori. Toute la ligne est cliquable (lien étiré). */
export function SimRow({ s, right, meta, className }: { s: SimMeta; right?: ReactNode; meta?: ReactNode; className?: string }) {
  return (
    <div className={cn('group relative flex items-center gap-3 px-3.5 py-2.5 min-h-[56px] transition-colors duration-160 hover:bg-surface2/60 active:bg-surface2 has-[a:focus-visible]:bg-surface2', className)}>
      <IconTile icon={s.icon} />
      <div className="flex-1 min-w-0">
        <Link to={`/sim/${s.id}`} className="block text-[14px] font-medium text-fg leading-tight truncate outline-none after:absolute after:inset-0">{s.title}</Link>
        <div className="text-[12.5px] text-muted truncate mt-[3px]">{s.short}</div>
      </div>
      {meta && <div className="text-[12px] text-muted tnum shrink-0 hidden sm:block">{meta}</div>}
      <div className="relative z-10 flex items-center">
        {right ?? <FavoriteButton id={s.id} title={s.title} />}
      </div>
      <ChevronRight className="h-4 w-4 text-faint shrink-0 -ml-1 md:hidden" />
    </div>
  );
}

/** Liste groupée (séparateurs fins), sur une ou deux colonnes. */
export function SimList({ items, className, columns = 2, meta }: { items: SimMeta[]; className?: string; columns?: 1 | 2; meta?: (s: SimMeta) => ReactNode }) {
  if (!items.length) return null;
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className={cn('grid', columns === 2 && 'lg:grid-cols-2')}>
        {items.map((s, k) => (
          <div key={s.id} className={cn('border-line', k > 0 && 'border-t', columns === 2 && k === 1 && 'lg:border-t-0', columns === 2 && k % 2 === 1 && 'lg:border-l')}>
            <SimRow s={s} meta={meta?.(s)} />
          </div>
        ))}
      </div>
    </Card>
  );
}

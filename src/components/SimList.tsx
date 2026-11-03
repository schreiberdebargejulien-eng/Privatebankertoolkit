import { Link } from 'react-router-dom';
import { ChevronRight, Star } from 'lucide-react';
import type { SimMeta } from '@/simulators/catalog';
import { Card } from '@/components/ui/primitives';
import { useFavorites } from '@/lib/store';
import { cn } from '@/lib/cn';

export function SimRow({ s, right }: { s: SimMeta; right?: React.ReactNode }) {
  const { isFavorite } = useFavorites();
  return (
    <Link to={`/sim/${s.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface2/70 transition">
      <div className="h-10 w-10 shrink-0 rounded-xl bg-accent/10 text-accent flex items-center justify-center"><s.icon className="h-[19px] w-[19px]" /></div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium leading-tight flex items-center gap-1.5">{s.title}{isFavorite(s.id) && <Star className="h-3 w-3 fill-gold text-gold" />}</div>
        <div className="text-[12.5px] text-muted truncate mt-0.5">{s.short}</div>
      </div>
      {right ?? <ChevronRight className="h-4 w-4 text-muted/60 shrink-0" />}
    </Link>
  );
}

export function SimList({ items, className }: { items: SimMeta[]; className?: string }) {
  if (!items.length) return null;
  return <Card className={cn('divide-y divide-line/60 overflow-hidden', className)}>{items.map((s) => <SimRow key={s.id} s={s} />)}</Card>;
}

export function SimTiles({ items }: { items: SimMeta[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((s) => (
        <Link key={s.id} to={`/sim/${s.id}`} className="rounded-2xl bg-surface border border-line/70 p-3.5 active:scale-[0.98] transition flex flex-col gap-3 min-h-[104px]">
          <div className="h-9 w-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center"><s.icon className="h-[18px] w-[18px]" /></div>
          <div>
            <div className="text-[14px] font-semibold leading-tight">{s.title}</div>
            <div className="text-[11.5px] text-muted mt-0.5 leading-snug line-clamp-2">{s.short}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

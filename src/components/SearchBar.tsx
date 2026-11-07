import { Search, X } from 'lucide-react';
import { Kbd } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

/** Champ de recherche de simulateurs (filtrage instantané). */
export function SearchBar({ value, onChange, autoFocus, size = 'md', className, placeholder = 'Lombard, IFI, TRI, donation…' }: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  size?: 'md' | 'lg';
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className={cn('absolute top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-muted pointer-events-none', size === 'lg' ? 'left-4' : 'left-3.5')} strokeWidth={1.75} />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full bg-surface hairline outline-none text-[16px] placeholder:text-faint transition-shadow duration-160 [&::-webkit-search-cancel-button]:hidden',
          'focus:shadow-[0_0_0_1px_rgb(var(--accent)/0.45),0_0_0_4px_rgb(var(--accent)/0.12)]',
          size === 'lg' ? 'h-12 md:h-[52px] rounded-2xl shadow-sm pl-11 pr-20' : 'h-11 rounded-xl shadow-xs pl-10 pr-10',
        )}
        aria-label="Rechercher un simulateur"
      />
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
        {value ? (
          <button className="h-8 w-8 flex items-center justify-center rounded-full text-muted hover:bg-surface2" onClick={() => onChange('')} aria-label="Effacer"><X className="h-4 w-4" /></button>
        ) : size === 'lg' ? <Kbd className="hidden md:inline-flex mr-1">⌘K</Kbd> : null}
      </div>
    </div>
  );
}

import { Search, X } from 'lucide-react';

export function SearchBar({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-muted" />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Lombard, IFI, TRI, donation…"
        className="w-full h-12 rounded-2xl bg-surface border border-line/70 pl-11 pr-10 text-[16px] outline-none focus:border-accent/60 placeholder:text-muted/70 [&::-webkit-search-cancel-button]:hidden"
        aria-label="Rechercher un simulateur"
      />
      {value && <button className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-muted" onClick={() => onChange('')} aria-label="Effacer"><X className="h-4 w-4" /></button>}
    </div>
  );
}

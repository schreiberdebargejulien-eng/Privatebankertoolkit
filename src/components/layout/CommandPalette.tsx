import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ChevronRight, CornerDownLeft, Home, Landmark, Library, LineChart, Search, Settings, Star, type LucideIcon } from 'lucide-react';
import { getMeta, searchSimulators, type SimMeta } from '@/simulators/catalog';
import { useFavorites, useRecents } from '@/lib/store';
import { normalize } from '@/lib/format';
import { IconTile, Kbd } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

/* =========================================================================
 * Palette de commande (⌘K / Ctrl+K, « / ») : recherche instantanée de
 * simulateurs et navigation au clavier. Feuille plein écran sur mobile.
 * ========================================================================= */

interface Ctx { open: () => void; close: () => void; isOpen: boolean }
const CommandContext = createContext<Ctx>({ open: () => {}, close: () => {}, isOpen: false });
export const useCommand = () => useContext(CommandContext);

const NAV: { label: string; to: string; icon: LucideIcon; keywords: string }[] = [
  { label: 'Accueil', to: '/', icon: Home, keywords: 'accueil home cockpit' },
  { label: 'Bibliothèque des calculateurs', to: '/calculateurs', icon: Library, keywords: 'bibliotheque calculateurs categories outils' },
  { label: 'Investissements', to: '/investissements', icon: LineChart, keywords: 'investissements structures obligations allocation' },
  { label: 'Patrimoine', to: '/patrimoine', icon: Landmark, keywords: 'patrimoine transmission projection' },
  { label: 'Favoris et scénarios', to: '/favoris', icon: Star, keywords: 'favoris scenarios historique recents' },
  { label: 'Paramètres', to: '/parametres', icon: Settings, keywords: 'parametres reglages theme devise' },
  { label: 'Barèmes et sources', to: '/sources', icon: BookOpen, keywords: 'baremes sources regles fiscales' },
];

type Item = { key: string; label: string; sub?: string; icon: LucideIcon; to: string; group: string };

export function CommandProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === '/' && !typing) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);
  return (
    <CommandContext.Provider value={value}>
      {children}
      {isOpen && <CommandPalette onClose={close} />}
    </CommandContext.Provider>
  );
}

const simItem = (s: SimMeta, group: string): Item => ({ key: `${group}-${s.id}`, label: s.title, sub: s.short, icon: s.icon, to: `/sim/${s.id}`, group });

function CommandPalette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const { favorites } = useFavorites();
  const { recents } = useRecents();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<Item[]>(() => {
    const metas = (ids: string[]) => ids.map(getMeta).filter(Boolean) as SimMeta[];
    if (!q.trim()) {
      const fav = metas(favorites.slice(0, 5)).map((s) => simItem(s, 'Favoris'));
      const rec = metas(recents.map((r) => r.id)).filter((s) => !favorites.includes(s.id)).slice(0, 5).map((s) => simItem(s, 'Récents'));
      const navs = NAV.map((n) => ({ key: n.to, label: n.label, icon: n.icon, to: n.to, group: 'Navigation' }));
      return [...fav, ...rec, ...navs];
    }
    const sims = searchSimulators(q).map((s) => simItem(s, 'Simulateurs'));
    const terms = normalize(q).split(/\s+/).filter(Boolean);
    const navs = NAV.filter((n) => terms.every((t) => normalize(n.label + ' ' + n.keywords).includes(t))).map((n) => ({ key: n.to, label: n.label, icon: n.icon, to: n.to, group: 'Navigation' }));
    return [...sims, ...navs];
  }, [q, favorites, recents]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus différé : laisse l'animation d'ouverture démarrer (iOS ouvre alors le clavier)
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => { document.body.style.overflow = prev; cancelAnimationFrame(id); };
  }, []);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (it: Item | undefined) => { if (!it) return; onClose(); nav(it.to); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[60] no-print" role="dialog" aria-modal="true" aria-label="Rechercher un simulateur" onKeyDown={onKey}>
      <div className="absolute inset-0 bg-black/25 dark:bg-black/55 animate-fade-in" onClick={onClose} />
      <div className={cn(
        'relative flex flex-col bg-surface overflow-hidden animate-scale-in',
        'h-full w-full safe-top',
        'md:h-auto md:max-h-[min(560px,72vh)] md:w-[min(620px,calc(100vw-48px))] md:mx-auto md:mt-[12vh] md:rounded-2xl md:shadow-lg md:hairline md:pt-0',
      )}>
        <div className="flex items-center gap-3 px-4 h-14 border-b border-line shrink-0">
          <Search className="h-[18px] w-[18px] text-muted shrink-0" strokeWidth={1.75} />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            inputMode="search"
            enterKeyHint="go"
            placeholder="Rechercher un simulateur, une notion…"
            aria-label="Rechercher"
            aria-controls="cmd-list"
            aria-activedescendant={items[active] ? `cmd-${active}` : undefined}
            className="flex-1 min-w-0 h-full bg-transparent outline-none text-[16px] placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
          />
          <button onClick={onClose} className="md:hidden text-[15px] font-medium text-accent px-1">Annuler</button>
          <Kbd className="hidden md:inline-flex">esc</Kbd>
        </div>
        <div ref={listRef} id="cmd-list" role="listbox" className="flex-1 overflow-y-auto overscroll-contain p-2 pb-[max(env(safe-area-inset-bottom),8px)]">
          {items.length === 0 && <div className="px-3 py-10 text-center text-[14px] text-muted">Aucun résultat pour « {q} ».</div>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.key}>
                {header && <div className="px-3 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">{header}</div>}
                <button
                  id={`cmd-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(it)}
                  className={cn('w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors', i === active ? 'bg-surface2' : '')}
                >
                  <IconTile icon={it.icon} size="sm" active={i === active && it.group !== 'Navigation'} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-medium text-fg truncate">{it.label}</span>
                    {it.sub && <span className="block text-[12.5px] text-muted truncate">{it.sub}</span>}
                  </span>
                  {i === active ? <CornerDownLeft className="h-3.5 w-3.5 text-muted hidden md:block" /> : <ChevronRight className="h-3.5 w-3.5 text-faint md:hidden" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="hidden md:flex items-center gap-4 px-4 h-10 border-t border-line text-[11.5px] text-muted shrink-0">
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> naviguer</span>
          <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> ouvrir</span>
          <span className="ml-auto">Calculs 100 % locaux</span>
        </div>
      </div>
    </div>
  );
}

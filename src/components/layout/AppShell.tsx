import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ChevronDown, Home, Landmark, Library, LineChart, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings, ShieldCheck, Star, Sun,
  type LucideIcon,
} from 'lucide-react';
import { CATEGORIES, byCategory, getMeta, type SimMeta } from '@/simulators/catalog';
import { useRecents, useStored } from '@/lib/store';
import { useSettings, type ThemePref } from '@/lib/settings';
import { useMediaQuery } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import { CommandProvider, useCommand } from './CommandPalette';
import { LogoMark, Wordmark } from './Logo';
import { Kbd } from '@/components/ui/primitives';

/* =========================================================================
 * Mise en page adaptative
 *  - téléphone (< 768 px) : barre d'onglets inférieure + recherche plein écran ;
 *  - tablette (768–1023 px) : rail latéral d'icônes ;
 *  - ordinateur (≥ 1024 px) : menu latéral complet, réductible en rail.
 * ========================================================================= */

const MAIN_NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Accueil', icon: Home, end: true },
  { to: '/favoris', label: 'Favoris', icon: Star },
  { to: '/calculateurs', label: 'Bibliothèque', icon: Library },
  { to: '/investissements', label: 'Investissements', icon: LineChart },
  { to: '/patrimoine', label: 'Patrimoine', icon: Landmark },
];

export function AppShell() {
  return (
    <CommandProvider>
      <Shell />
    </CommandProvider>
  );
}

function Shell() {
  const loc = useLocation();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [collapsedPref, setCollapsed] = useStored<boolean>('ui.sidebarCollapsed', false);
  const collapsed = !isDesktop || collapsedPref;
  return (
    <div className="min-h-full" style={{ ['--sb' as string]: collapsed ? 'var(--sidebar-rail)' : 'var(--sidebar-w)' }}>
      <Sidebar collapsed={collapsed} canToggle={isDesktop} onToggle={() => setCollapsed(!collapsedPref)} />
      <main key={loc.pathname} className="min-h-full md:pl-[var(--sb)] transition-[padding] duration-240 ease-apple animate-fade-in">
        <Outlet />
      </main>
      <MobileTabBar />
    </div>
  );
}

/* ------------------------------ Menu latéral ------------------------------ */
function Sidebar({ collapsed, canToggle, onToggle }: { collapsed: boolean; canToggle: boolean; onToggle: () => void }) {
  const { open } = useCommand();
  const { recents } = useRecents();
  const [catsOpen, setCatsOpen] = useStored<boolean>('ui.sidebarCategories', true);
  const recentMetas = (recents.map((r) => getMeta(r.id)).filter(Boolean) as SimMeta[]).filter((m, k, a) => a.findIndex((x) => x.id === m.id) === k).slice(0, 4);

  return (
    <aside
      className="hidden md:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-line bg-bg no-print transition-[width] duration-240 ease-apple overflow-hidden"
      style={{ width: 'var(--sb)' }}
      aria-label="Navigation principale"
    >
      {/* Marque */}
      <div className={cn('flex items-center h-14 shrink-0', collapsed ? 'justify-center' : 'px-4 gap-2.5')}>
        <Link to="/" className="flex items-center gap-2.5 min-w-0" aria-label="Accueil">
          <LogoMark />
          {!collapsed && <Wordmark />}
        </Link>
        {!collapsed && canToggle && (
          <button onClick={onToggle} className="ml-auto h-7 w-7 flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-surface2 transition-colors" aria-label="Réduire le menu" title="Réduire le menu">
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Recherche */}
      <div className={cn('shrink-0 pb-2', collapsed ? 'px-3' : 'px-3')}>
        {collapsed ? (
          <RailButton icon={Search} label="Rechercher (⌘K)" onClick={open} />
        ) : (
          <button onClick={open} className="w-full flex items-center gap-2 h-8 rounded-lg bg-surface hairline shadow-xs px-2.5 text-[13px] text-muted hover:text-fg transition-colors">
            <Search className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="flex-1 text-left">Rechercher…</span>
            <Kbd className="h-[18px] text-[10.5px]">⌘K</Kbd>
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none px-3 pb-3">
        <div className="space-y-px">
          {MAIN_NAV.map((n) => collapsed
            ? <RailLink key={n.to} {...n} />
            : <SideLink key={n.to} {...n} />)}
        </div>

        {!collapsed && (
          <>
            <div className="mt-6">
              <button onClick={() => setCatsOpen(!catsOpen)} className="w-full flex items-center justify-between px-2.5 h-7 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted hover:text-fg transition-colors" aria-expanded={catsOpen}>
                Catégories
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-240 ease-apple', !catsOpen && '-rotate-90')} />
              </button>
              {catsOpen && (
                <div className="space-y-px mt-1 animate-fade-in">
                  {CATEGORIES.map((c) => (
                    <SideLink key={c.id} to={`/calculateurs/${c.id}`} label={c.label} icon={c.icon} count={byCategory(c.id).length} small />
                  ))}
                </div>
              )}
            </div>
            {recentMetas.length > 0 && (
              <div className="mt-6">
                <div className="px-2.5 h-7 flex items-center text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">Récents</div>
                <div className="space-y-px mt-1">
                  {recentMetas.map((m) => <SideLink key={m.id} to={`/sim/${m.id}`} label={m.title} icon={m.icon} small />)}
                </div>
              </div>
            )}
          </>
        )}
      </nav>

      {/* Pied */}
      <div className={cn('shrink-0 border-t border-line p-3 space-y-2', collapsed && 'flex flex-col items-center')}>
        {collapsed ? <RailLink to="/parametres" label="Paramètres" icon={Settings} /> : <SideLink to="/parametres" label="Paramètres" icon={Settings} />}
        <ThemeSwitch compact={collapsed} />
        {collapsed && canToggle && <RailButton icon={PanelLeftOpen} label="Déployer le menu" onClick={onToggle} />}
        {!collapsed && (
          <div className="flex items-center gap-1.5 px-2.5 pt-1 text-[11px] text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-pos shrink-0" strokeWidth={1.75} /> Calculs 100 % locaux
          </div>
        )}
      </div>
    </aside>
  );
}

function SideLink({ to, label, icon: Icon, end, count, small }: { to: string; label: string; icon: LucideIcon; end?: boolean; count?: number; small?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn(
        'group flex items-center gap-2.5 rounded-lg px-2.5 transition-colors duration-160',
        small ? 'h-[30px] text-[13px]' : 'h-8 text-[13.5px] font-medium',
        isActive ? 'bg-surface text-fg shadow-xs hairline' : 'text-fg/70 hover:bg-surface2 hover:text-fg',
      )}
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-accent' : 'text-muted group-hover:text-fg/80')} strokeWidth={1.75} />
          <span className="flex-1 truncate">{label}</span>
          {count !== undefined && <span className="text-[11px] text-faint tnum">{count}</span>}
        </>
      )}
    </NavLink>
  );
}

function Tip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-fg text-bg px-2 py-1 text-[12px] font-medium opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-160 z-50 shadow-md">
      {label}
    </span>
  );
}

function RailLink({ to, label, icon: Icon, end }: { to: string; label: string; icon: LucideIcon; end?: boolean }) {
  return (
    <NavLink to={to} end={end} aria-label={label} className={({ isActive }) => cn('group relative mx-auto flex h-10 w-10 items-center justify-center rounded-lg transition-colors', isActive ? 'bg-surface hairline shadow-xs text-accent' : 'text-muted hover:bg-surface2 hover:text-fg')}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      <Tip label={label} />
    </NavLink>
  );
}

function RailButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} className="group relative mx-auto flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-fg transition-colors">
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      <Tip label={label} />
    </button>
  );
}

const THEMES: { value: ThemePref; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'Système', icon: Monitor },
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
];

/** Bascule clair / sombre / système. */
export function ThemeSwitch({ compact }: { compact?: boolean }) {
  const { settings, update } = useSettings();
  if (compact) {
    const k = THEMES.findIndex((t) => t.value === settings.theme);
    const next = THEMES[(k + 1) % THEMES.length];
    const Cur = THEMES[k]?.icon ?? Monitor;
    return <RailButton icon={Cur} label={`Thème : ${THEMES[k]?.label} — passer en ${next.label.toLowerCase()}`} onClick={() => update({ theme: next.value })} />;
  }
  return (
    <div className="flex rounded-lg bg-surface2 p-[3px] gap-[3px]" role="radiogroup" aria-label="Thème">
      {THEMES.map((t) => (
        <button
          key={t.value}
          role="radio"
          aria-checked={settings.theme === t.value}
          aria-label={t.label}
          title={t.label}
          onClick={() => update({ theme: t.value })}
          className={cn('flex-1 h-7 rounded-md flex items-center justify-center transition-[background-color,color] duration-160', settings.theme === t.value ? 'bg-surface text-fg shadow-sm dark:bg-line' : 'text-muted hover:text-fg')}
        >
          <t.icon className="h-3.5 w-3.5" strokeWidth={1.9} />
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Barre d'onglets (téléphone) ------------------------------ */
function MobileTabBar() {
  const { open, isOpen } = useCommand();
  const tab = 'flex flex-col items-center justify-center gap-[3px] h-[52px] text-[10px] font-medium transition-colors';
  const items: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
    { to: '/', label: 'Accueil', icon: Home, end: true },
    { to: '/calculateurs', label: 'Outils', icon: Library },
  ];
  const right: { to: string; label: string; icon: LucideIcon }[] = [
    { to: '/favoris', label: 'Favoris', icon: Star },
    { to: '/parametres', label: 'Réglages', icon: Settings },
  ];
  const link = (t: { to: string; label: string; icon: LucideIcon; end?: boolean }) => (
    <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cn(tab, isActive ? 'text-accent' : 'text-muted')}>
      {({ isActive }) => (
        <>
          <t.icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2 : 1.6} />
          {t.label}
        </>
      )}
    </NavLink>
  );
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 chrome border-t border-line safe-bottom no-print" aria-label="Navigation principale">
      <div className="grid grid-cols-5">
        {items.map(link)}
        <button onClick={open} className={cn(tab, isOpen ? 'text-accent' : 'text-muted')} aria-label="Rechercher un simulateur">
          <Search className="h-[22px] w-[22px]" strokeWidth={1.6} />
          Rechercher
        </button>
        {right.map(link)}
      </div>
    </nav>
  );
}

/* ------------------------------ Conteneurs de page ------------------------------ */

/** Conteneur de page : marges latérales et largeur de lecture confortable. */
export const PAGE = 'px-4 md:px-8 lg:px-10 w-full max-w-[1120px] mx-auto';
/** Marge basse : dégage la barre d'onglets mobile. */
export const PAGE_BOTTOM = 'pb-[calc(env(safe-area-inset-bottom)+96px)] md:pb-16';

export function PageHeader({ title, subtitle, eyebrow, right, back, className }: {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  right?: ReactNode;
  back?: { to?: string; label: string; onClick?: () => void };
  className?: string;
}) {
  const backCls = 'inline-flex items-center gap-0.5 h-8 px-1.5 rounded-md text-[14px] font-medium text-accent hover:bg-accent/5 transition-colors';
  const backInner = back && <><ChevronDown className="h-4 w-4 rotate-90" strokeWidth={2} /> {back.label}</>;
  return (
    <header className={cn('safe-top', PAGE, className)}>
      {back && (
        <div className="pt-3 md:pt-6 -ml-1.5">
          {back.onClick ? <button onClick={back.onClick} className={backCls}>{backInner}</button> : <Link to={back.to ?? '/'} className={backCls}>{backInner}</Link>}
        </div>
      )}
      <div className={cn('flex items-end justify-between gap-4 pb-6 md:pb-8', back ? 'pt-3 md:pt-4' : 'pt-7 md:pt-12')}>
        <div className="min-w-0 animate-fade-up">
          {eyebrow && <div className="text-[12.5px] font-medium text-muted mb-1.5">{eyebrow}</div>}
          <h1 className="text-[30px] md:text-[34px] font-semibold tracking-[-0.028em] leading-[1.1] text-fg">{title}</h1>
          {subtitle && <p className="text-[15px] text-muted mt-2 leading-snug max-w-2xl">{subtitle}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}

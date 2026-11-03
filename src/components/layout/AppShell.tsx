import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, Calculator, LineChart, Landmark, Star, Settings, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/cn';

const TABS = [
  { to: '/', label: 'Accueil', icon: Home, end: true },
  { to: '/calculateurs', label: 'Calculateurs', icon: Calculator },
  { to: '/investissements', label: 'Investissements', short: 'Investir', icon: LineChart },
  { to: '/patrimoine', label: 'Patrimoine', icon: Landmark },
  { to: '/favoris', label: 'Favoris', icon: Star },
];

/**
 * Mise en page adaptative :
 *  - téléphone et tablette (< 1024 px) : barre de navigation inférieure ;
 *  - ordinateur (≥ 1024 px) : menu latéral fixe.
 */
export function AppShell() {
  const loc = useLocation();
  return (
    <div className="min-h-full">
      {/* Menu latéral — ordinateur */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-line/70 bg-surface/60 backdrop-blur-xl no-print" aria-label="Navigation principale">
        <div className="flex items-center gap-3 px-5 h-20">
          <img src="./icon-192.png" alt="" className="h-9 w-9 rounded-xl" />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">Private Banker</div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-accent">Toolkit</div>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 h-11 text-[14.5px] font-medium transition', isActive ? 'bg-accent/10 text-accent' : 'text-fg/75 hover:bg-surface2 hover:text-fg')}>
              <t.icon className="h-[19px] w-[19px]" />
              {t.label}
            </NavLink>
          ))}
          <div className="pt-3 mt-3 border-t border-line/60">
            <NavLink to="/parametres" className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 h-11 text-[14.5px] font-medium transition', isActive ? 'bg-accent/10 text-accent' : 'text-fg/75 hover:bg-surface2 hover:text-fg')}>
              <Settings className="h-[19px] w-[19px]" /> Paramètres
            </NavLink>
          </div>
        </nav>
        <div className="m-3 rounded-xl bg-surface2/60 p-3 text-[11.5px] text-muted leading-snug flex gap-2">
          <ShieldCheck className="h-4 w-4 text-accent shrink-0" />
          Calculs 100 % locaux. Aucune donnée transmise.
        </div>
      </aside>

      <main key={loc.pathname.split('/')[1]} className="min-h-full lg:pl-64">
        <Outlet />
      </main>

      {/* Barre inférieure — téléphone et tablette */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line/70 bg-bg/90 backdrop-blur-xl safe-bottom no-print" aria-label="Navigation principale">
        <div className="mx-auto max-w-3xl grid grid-cols-5">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cn('flex flex-col items-center justify-center gap-1 h-[60px] text-[10.5px] md:text-[12px] font-medium transition', isActive ? 'text-accent' : 'text-muted')}>
              {({ isActive }) => (
                <>
                  <t.icon className={cn('h-[22px] w-[22px]', isActive && 'stroke-[2.2]')} />
                  {t.short ?? t.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Conteneur de page : largeur adaptée à l'écran. */
export const PAGE = 'px-4 md:px-8 max-w-2xl md:max-w-3xl lg:max-w-5xl mx-auto';

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className={cn('safe-top', PAGE)}>
      <div className="flex items-end justify-between pt-6 lg:pt-10 pb-4 gap-3">
        <div>
          <h1 className="text-[28px] lg:text-[32px] font-semibold tracking-tight leading-none">{title}</h1>
          {subtitle && <p className="text-[14px] text-muted mt-2">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}

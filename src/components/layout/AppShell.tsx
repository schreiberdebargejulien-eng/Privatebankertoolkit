import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, Calculator, LineChart, Landmark, Star } from 'lucide-react';
import { cn } from '@/lib/cn';

const TABS = [
  { to: '/', label: 'Accueil', icon: Home, end: true },
  { to: '/calculateurs', label: 'Calculateurs', icon: Calculator },
  { to: '/investissements', label: 'Investir', icon: LineChart },
  { to: '/patrimoine', label: 'Patrimoine', icon: Landmark },
  { to: '/favoris', label: 'Favoris', icon: Star },
];

export function AppShell() {
  const loc = useLocation();
  return (
    <div className="min-h-full">
      <main key={loc.pathname.split('/')[1]} className="min-h-full">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-line/70 bg-bg/90 backdrop-blur-xl safe-bottom no-print" aria-label="Navigation principale">
        <div className="mx-auto max-w-2xl grid grid-cols-5">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cn('flex flex-col items-center justify-center gap-1 h-[60px] text-[10.5px] font-medium transition', isActive ? 'text-accent' : 'text-muted')}>
              {({ isActive }) => (
                <>
                  <t.icon className={cn('h-[22px] w-[22px]', isActive && 'stroke-[2.2]')} />
                  {t.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <header className="safe-top px-4 max-w-2xl mx-auto">
      <div className="flex items-end justify-between pt-6 pb-4 gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight leading-none">{title}</h1>
          {subtitle && <p className="text-[14px] text-muted mt-2">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}

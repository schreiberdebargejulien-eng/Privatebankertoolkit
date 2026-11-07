import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useStored } from './store';

export type ThemePref = 'system' | 'light' | 'dark';
export type Currency = 'EUR' | 'CHF' | 'USD' | 'GBP';

export interface Settings {
  theme: ThemePref;
  currency: Currency;
  /** Afficher les centimes dans les résultats. */
  showCents: boolean;
  /** Version de barème IR par défaut ('auto' = selon la date du jour). */
  irVersion: string;
  /** Convention de décompte des jours par défaut (obligations). */
  dayCount: 'ACT/ACT' | 'ACT/365' | 'ACT/360' | '30/360';
  /** Date des versements par défaut (début/fin de période). */
  contributionTiming: 'start' | 'end';
  /** Taux d'inflation par défaut. */
  inflation: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  currency: 'EUR',
  showCents: false,
  irVersion: 'auto',
  dayCount: 'ACT/ACT',
  contributionTiming: 'end',
  inflation: 0.02,
};

interface Ctx { settings: Settings; update: (p: Partial<Settings>) => void; resolvedTheme: 'light' | 'dark' }
const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useStored<Partial<Settings>>('settings', {});
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...stored }), [stored]);
  const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const resolvedTheme: 'light' | 'dark' = settings.theme === 'system' ? (prefersDark ? 'dark' : 'light') : settings.theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', resolvedTheme === 'dark' ? '#161618' : '#F7F8FA'));
  }, [resolvedTheme]);

  useEffect(() => {
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = () => document.documentElement.classList.toggle('dark', mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [settings.theme]);

  const value = useMemo<Ctx>(() => ({ settings, update: (p) => setStored((s) => ({ ...s, ...p })), resolvedTheme }), [settings, setStored, resolvedTheme]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const c = useContext(SettingsContext);
  if (!c) throw new Error('SettingsProvider manquant');
  return c;
}

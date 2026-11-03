import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';

/** Hook de lecture/écriture d'une clé locale, synchronisé entre composants. */
export function useStored<T>(key: string, fallback: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readJSON(key, fallback));
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d === key || d === '*') setValue(readJSON(key, fallback));
    };
    window.addEventListener('pbt-storage', h);
    return () => window.removeEventListener('pbt-storage', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback((v: T | ((p: T) => T)) => {
    const next = typeof v === 'function' ? (v as (p: T) => T)(readJSON(key, fallback)) : v;
    writeJSON(key, next);
    setValue(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, set];
}

export function useFavorites() {
  const [favs, setFavs] = useStored<string[]>('favorites', []);
  const toggle = useCallback((id: string) => setFavs((f) => (f.includes(id) ? f.filter((x) => x !== id) : [id, ...f])), [setFavs]);
  return { favorites: favs, isFavorite: (id: string) => favs.includes(id), toggle };
}

export interface RecentEntry { id: string; at: number }
export function useRecents() {
  const [recents, setRecents] = useStored<RecentEntry[]>('recents', []);
  const [usage, setUsage] = useStored<Record<string, number>>('usage', {});
  const track = useCallback((id: string) => {
    setRecents((r) => [{ id, at: Date.now() }, ...r.filter((x) => x.id !== id)].slice(0, 12));
    setUsage((u) => ({ ...u, [id]: (u[id] ?? 0) + 1 }));
  }, [setRecents, setUsage]);
  const clear = useCallback(() => { setRecents([]); setUsage({}); }, [setRecents, setUsage]);
  return { recents, usage, track, clear };
}

export interface SavedScenario {
  id: string;
  simId: string;
  label: string;
  savedAt: number;
  values: Record<string, unknown>;
}
export function useScenarios() {
  const [scenarios, setScenarios] = useStored<SavedScenario[]>('scenarios', []);
  const save = useCallback((s: Omit<SavedScenario, 'id' | 'savedAt'>) => {
    const id = (crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(16).slice(2));
    setScenarios((all) => [{ ...s, id, savedAt: Date.now() }, ...all].slice(0, 100));
    return id;
  }, [setScenarios]);
  const remove = useCallback((id: string) => setScenarios((all) => all.filter((s) => s.id !== id)), [setScenarios]);
  const clear = useCallback(() => setScenarios([]), [setScenarios]);
  return { scenarios, save, remove, clear };
}

/**
 * Stockage local (localStorage) — aucune donnée n'est transmise à un serveur.
 * Par défaut, seules des préférences et des identifiants de simulateurs sont persistés.
 * Les valeurs saisies ne sont enregistrées QUE sur action explicite (« Enregistrer le scénario »).
 * Point d'extension : remplacer `backend` par un stockage chiffré (WebCrypto + IndexedDB)
 * derrière une authentification, sans modifier les appelants.
 */
export interface StorageBackend {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

const memory = new Map<string, string>();
const localBackend: StorageBackend = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return memory.get(k) ?? null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { memory.set(k, v); } },
  remove: (k) => { try { localStorage.removeItem(k); } catch { memory.delete(k); } },
  keys: () => { try { return Object.keys(localStorage); } catch { return [...memory.keys()]; } },
};

let backend: StorageBackend = localBackend;
export function setStorageBackend(b: StorageBackend) { backend = b; }

const PREFIX = 'pbt.';
export function readJSON<T>(key: string, fallback: T): T {
  const raw = backend.get(PREFIX + key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
export function writeJSON(key: string, value: unknown) {
  backend.set(PREFIX + key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('pbt-storage', { detail: key }));
}
export function clearAllLocalData() {
  for (const k of backend.keys()) if (k.startsWith(PREFIX)) backend.remove(k);
  window.dispatchEvent(new CustomEvent('pbt-storage', { detail: '*' }));
}

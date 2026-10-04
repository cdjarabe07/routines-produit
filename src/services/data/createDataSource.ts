import type { AppEnv } from '@/app/config/env';
import { buildDemoData } from '@/data/demo/seed';
import { SECTOR_KEYS, type SectorKey } from '@/data/sectors';
import { createHttpDataSource } from './httpDataSource';
import { createMemoryStore, createStoreDataSource, type KeyValueStore } from './storeDataSource';
import type { DataSource } from './types';

/** Secteur de la démo choisi sur la vitrine (lien « app/?secteur=… »), mémorisé dans le navigateur */
const SECTOR_KEY = 'ra:demo-sector';
/** Préfixe des données de la démo (storeDataSource) */
const DEMO_PREFIX = 'ra:v2:';

function browserStore(): KeyValueStore {
  try {
    const probe = '__ra_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Navigation privée stricte ou stockage bloqué : la démo fonctionne en mémoire (perdue au rechargement).
    return createMemoryStore();
  }
}

const isSector = (v: string | null): v is SectorKey => v !== null && (SECTOR_KEYS as string[]).includes(v);

export function createDataSource(env: AppEnv, getToken: () => string | null): DataSource {
  if (env.dataMode === 'api' && env.apiBaseUrl) return createHttpDataSource(env.apiBaseUrl, getToken);
  const store = browserStore();
  const stored = store.getItem(SECTOR_KEY);
  const requested = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('secteur');
  const sector: SectorKey = isSector(requested) ? requested : isSector(stored) ? stored : 'automotive';
  // Démo déjà chargée dans un autre secteur : rechargée dans le secteur demandé
  const reload = sector !== (isSector(stored) ? stored : 'automotive') && store.getItem(`${DEMO_PREFIX}meta`) !== null;
  store.setItem(SECTOR_KEY, sector);
  // La réinitialisation (Paramètres) recharge la démo du secteur en cours
  const ds = createStoreDataSource(store, () => buildDemoData(new Date(), sector));
  if (reload) void ds.resetDemoData?.();
  return ds;
}

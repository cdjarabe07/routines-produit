import type { AppEnv } from '@/app/config/env';
import { buildDemoData } from '@/data/demo/seed';
import { createHttpDataSource } from './httpDataSource';
import { createMemoryStore, createStoreDataSource, type KeyValueStore } from './storeDataSource';
import type { DataSource } from './types';

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

export function createDataSource(env: AppEnv, getToken: () => string | null): DataSource {
  if (env.dataMode === 'api' && env.apiBaseUrl) return createHttpDataSource(env.apiBaseUrl, getToken);
  return createStoreDataSource(browserStore(), () => buildDemoData(new Date()));
}

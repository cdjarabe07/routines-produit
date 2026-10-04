import type { BaseEntity, ID } from '@/types/domain';
import { createId } from '@/utils/id';
import { NotFoundError, StorageError } from '@/services/errors';
import { createLogger } from '@/services/logger';
import { todayKey } from '@/utils/date';
import { createLocalTelemetry } from './telemetryStore';
import type { CollectionMap, CollectionName, DataSource, Dataset, EntityPatch, ListFilter, NewEntity, Repository } from './types';
import { COLLECTIONS } from './types';

/* Source de données « DÉMO » : collections JSON dans un magasin clé/valeur
   (localStorage dans le navigateur, mémoire dans les tests). */

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/* v2 : modèle planification / tâches / équipes. Les données v1 ne sont pas migrées : le jeu initial est rechargé. */
const PREFIX = 'ra:v2:';
const META_KEY = `${PREFIX}meta`;
const log = createLogger('data:store');

function matches<T>(item: T, filter?: ListFilter<T>) {
  const where = filter?.where;
  if (where && !(Object.keys(where) as (keyof T)[]).every((k) => item[k] === where[k])) return false;
  const range = filter?.range;
  if (range) {
    const v = item[range.field] as unknown;
    if (typeof v !== 'string') return false;
    if (range.gte !== undefined && v < range.gte) return false;
    if (range.lt !== undefined && v >= range.lt) return false;
  }
  return true;
}

export function createStoreDataSource(store: KeyValueStore, buildSeed: () => Dataset): DataSource {
  const cache = new Map<CollectionName, BaseEntity[]>();

  const read = <K extends CollectionName>(name: K): CollectionMap[K][] => {
    if (!cache.has(name)) {
      const raw = store.getItem(PREFIX + name);
      let parsed: BaseEntity[] = [];
      if (raw) {
        try {
          parsed = JSON.parse(raw) as BaseEntity[];
        } catch (error) {
          log.error(`Collection ${name} illisible, réinitialisée`, error);
        }
      }
      cache.set(name, parsed);
    }
    return cache.get(name) as CollectionMap[K][];
  };

  const write = (name: CollectionName, items: BaseEntity[]) => {
    try {
      store.setItem(PREFIX + name, JSON.stringify(items));
      cache.set(name, items);
    } catch (error) {
      log.error(`Écriture impossible pour ${name}`, error);
      throw new StorageError(error);
    }
  };

  const seed = () => {
    const data = buildSeed();
    for (const name of COLLECTIONS) write(name, data[name] as BaseEntity[]);
    store.setItem(META_KEY, JSON.stringify({ seededAt: new Date().toISOString() }));
    log.info('Jeu de démonstration chargé');
  };

  if (!store.getItem(META_KEY)) seed();

  const clone = <T>(v: T): T => structuredClone(v);

  function repo<K extends CollectionName>(name: K): Repository<CollectionMap[K]> {
    type T = CollectionMap[K];
    return {
      async list(filter?: ListFilter<T>) {
        return clone(read(name).filter((i) => matches(i, filter)));
      },
      async get(id: ID) {
        const found = read(name).find((i) => i.id === id);
        if (!found) throw new NotFoundError();
        return clone(found);
      },
      async create(input: NewEntity<T>) {
        const now = new Date().toISOString();
        const entity = { ...input, id: input.id ?? createId(), createdAt: now, updatedAt: now } as T;
        write(name, [...read(name), entity]);
        return clone(entity);
      },
      async update(id: ID, patch: EntityPatch<T>) {
        const items = read(name);
        const index = items.findIndex((i) => i.id === id);
        if (index < 0) throw new NotFoundError();
        const updated = { ...items[index], ...patch, id, updatedAt: new Date().toISOString() } as T;
        const next = [...items];
        next[index] = updated;
        write(name, next);
        return clone(updated);
      },
      async remove(id: ID) {
        write(
          name,
          read(name).filter((i) => i.id !== id),
        );
      },
    };
  }

  return {
    kind: 'demo',
    repo,
    telemetry: createLocalTelemetry(store, todayKey),
    async resetDemoData() {
      cache.clear();
      for (const name of COLLECTIONS) store.removeItem(PREFIX + name);
      seed();
    },
  };
}

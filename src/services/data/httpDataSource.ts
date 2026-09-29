import type { ID } from '@/types/domain';
import { ApiError, NetworkError, PermissionError } from '@/services/errors';
import { createLogger } from '@/services/logger';
import type { CollectionMap, CollectionName, DataSource, EntityPatch, ListFilter, NewEntity, Repository } from './types';

/* Source de données « API » : backend REST générique.
   Contrat : GET/POST {base}/{collection}, GET/PATCH/DELETE {base}/{collection}/{id}.
   Voir docs/deployment.md. Non exercée tant qu'aucun backend n'est configuré. */

const log = createLogger('data:http');

const toPath = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function createHttpDataSource(baseUrl: string, getToken: () => string | null): DataSource {
  const root = baseUrl.replace(/\/$/, '');

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await fetch(`${root}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (error) {
      log.error(`${method} ${path} — réseau`, error);
      throw new NetworkError(error);
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      log.error(`${method} ${path} — HTTP ${response.status}`, detail);
      // 403 : le serveur applique la même matrice de droits que l'interface
      if (response.status === 403) throw new PermissionError();
      throw new ApiError(response.status, detail);
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }

  function repo<K extends CollectionName>(name: K): Repository<CollectionMap[K]> {
    type T = CollectionMap[K];
    const base = `/${toPath(name)}`;
    return {
      list(filter?: ListFilter<T>) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(filter?.where ?? {})) params.set(k, String(v));
        const qs = params.toString();
        return request<T[]>('GET', qs ? `${base}?${qs}` : base);
      },
      get: (id: ID) => request<T>('GET', `${base}/${encodeURIComponent(id)}`),
      create: (input: NewEntity<T>) => request<T>('POST', base, input),
      update: (id: ID, patch: EntityPatch<T>) => request<T>('PATCH', `${base}/${encodeURIComponent(id)}`, patch),
      remove: (id: ID) => request<void>('DELETE', `${base}/${encodeURIComponent(id)}`),
    };
  }

  return { kind: 'api', repo };
}

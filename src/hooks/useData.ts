import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataSource } from '@/app/providers/DataSourceProvider';
import { useToast } from '@/components/ui/Toast';
import type { CollectionMap, CollectionName, DataSource, ListFilter } from '@/services/data/types';
import { toUserMessage } from '@/services/errors';
import { createLogger } from '@/services/logger';

/* Hooks génériques d'accès aux données. Les modules métier les composent
   dans leurs propres api.ts ; les composants n'appellent jamais le DataSource. */

const log = createLogger('data');

const collectionKey = (name: CollectionName) => ['collection', name] as const;

/** Collection entière, ou filtrée (égalité, période) : chaque filtre a son cache, rafraîchi avec la collection. */
export function useCollection<K extends CollectionName>(name: K, filter?: ListFilter<CollectionMap[K]>) {
  const ds = useDataSource();
  return useQuery({
    queryKey: filter ? [...collectionKey(name), filter] : collectionKey(name),
    queryFn: () => ds.repo(name).list(filter) as Promise<CollectionMap[K][]>,
  });
}

interface OperationOptions<R> {
  /** Collections à rafraîchir après succès */
  invalidates: CollectionName[];
  /** Message de succès (texte, ou fonction du résultat ; null = pas de message) */
  success?: string | ((result: R) => string | null);
}

/** Opération métier (une ou plusieurs écritures) avec invalidation et messages uniformes. */
export function useOperation<V, R>(run: (ds: DataSource, vars: V) => Promise<R>, options: OperationOptions<R>) {
  const ds = useDataSource();
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (vars: V) => run(ds, vars),
    onSuccess: async (result) => {
      await Promise.all(options.invalidates.map((name) => client.invalidateQueries({ queryKey: collectionKey(name) })));
      const message = typeof options.success === 'function' ? options.success(result) : options.success;
      if (message) toast.success(message);
    },
    onError: (error) => {
      log.error('Opération échouée', error);
      toast.error(toUserMessage(error));
    },
  });
}

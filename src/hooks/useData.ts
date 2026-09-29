import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataSource } from '@/app/providers/DataSourceProvider';
import { useToast } from '@/components/ui/Toast';
import type { CollectionMap, CollectionName, DataSource } from '@/services/data/types';
import { toUserMessage } from '@/services/errors';
import { createLogger } from '@/services/logger';

/* Hooks génériques d'accès aux données. Les modules métier les composent
   dans leurs propres api.ts ; les composants n'appellent jamais le DataSource. */

const log = createLogger('data');

export const collectionKey = (name: CollectionName) => ['collection', name] as const;

export function useCollection<K extends CollectionName>(name: K) {
  const ds = useDataSource();
  return useQuery({
    queryKey: collectionKey(name),
    queryFn: () => ds.repo(name).list() as Promise<CollectionMap[K][]>,
  });
}

export function useEntity<K extends CollectionName>(name: K, id: string | undefined) {
  const ds = useDataSource();
  return useQuery({
    queryKey: [...collectionKey(name), id],
    queryFn: () => ds.repo(name).get(id!) as Promise<CollectionMap[K]>,
    enabled: Boolean(id),
  });
}

interface OperationOptions<R> {
  /** Collections à rafraîchir après succès */
  invalidates: CollectionName[];
  /** Message de succès (texte ou fonction du résultat) */
  success?: string | ((result: R) => string);
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
      if (options.success) toast.success(typeof options.success === 'function' ? options.success(result) : options.success);
    },
    onError: (error) => {
      log.error('Opération échouée', error);
      toast.error(toUserMessage(error));
    },
  });
}

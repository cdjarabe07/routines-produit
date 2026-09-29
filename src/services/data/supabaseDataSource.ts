import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, RoutineRun, User } from '@/types/domain';
import { ApiError, NetworkError, NotFoundError, PermissionError, ValidationError } from '@/services/errors';
import { createLogger } from '@/services/logger';
import type {
  AccountAdmin,
  AuditEntry,
  CollectionMap,
  CollectionName,
  DataSource,
  Dataset,
  EntityPatch,
  ListFilter,
  NewEntity,
  Repository,
} from './types';

/* Source de données Supabase (PostgREST). Le navigateur n'est pas une frontière de sécurité :
   chaque requête est filtrée par la RLS et les triggers du serveur (supabase/migrations).
   Colonnes en camelCase : les noms des champs du domaine sont conservés tels quels. */

const log = createLogger('data:supabase');

interface PgError {
  code?: string;
  message?: string;
  status?: number;
}

/** Traduit une erreur PostgREST en erreur typée ; le détail technique reste dans le journal. */
export function toAppError(error: PgError, context: string): Error {
  log.error(context, error);
  const code = error.code ?? '';
  const message = error.message ?? '';
  // Messages des triggers : rédigés pour l'utilisateur
  if (code === '42501') return /row-level security|permission denied/i.test(message) ? new PermissionError() : new PermissionError(message);
  if (code === 'P0001' || code === '54000' || code === '22023') return new ValidationError(message);
  if (code === '23505')
    return new ValidationError(/duplicate key/i.test(message) ? 'Cet élément existe déjà (valeur unique en double).' : message);
  if (code === '23503') return new ValidationError('Un élément référencé est introuvable ou encore utilisé ailleurs.');
  if (code === '23514' || code === '22P02' || code === '23502' || code === '22001')
    return new ValidationError('Données refusées par le serveur : un champ est invalide ou trop long.');
  if (code === 'PGRST116' || code === 'P0002') return new NotFoundError();
  if (code === 'PGRST301' || code === 'PGRST303' || error.status === 401) return new ApiError(401, message);
  if (!code && /fetch|network/i.test(message)) return new NetworkError(error);
  return new ApiError(error.status ?? 500, message);
}

/** null (SQL) → champ absent (domaine) */
function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (v !== null) out[k] = v;
  return out as T;
}

/** Champ explicitement vidé (undefined) → null, sinon il serait ignoré à la sérialisation. */
function toPatch(patch: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) out[k] = v === undefined ? null : v;
  return out;
}

function toInsert(input: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (v !== undefined) out[k] = v;
  return out;
}

export interface SupabaseDataSourceOptions {
  /** Jeu de démonstration (chargé à la demande : absent du code initial). */
  loadDemoDataset?: () => Promise<Dataset>;
  timezone?: () => string;
}

export function createSupabaseDataSource(client: SupabaseClient, options: SupabaseDataSourceOptions = {}): DataSource {
  function repo<K extends CollectionName>(name: K): Repository<CollectionMap[K]> {
    type T = CollectionMap[K];
    const table = () => client.from(name);
    return {
      async list(filter?: ListFilter<T>) {
        let query = table().select('*');
        for (const [k, v] of Object.entries(filter?.where ?? {})) if (v !== undefined) query = query.eq(k, v as string);
        const { data, error } = await query;
        if (error) throw toAppError(error, `list ${name}`);
        return (data ?? []).map((r) => fromRow<T>(r));
      },
      async get(id: ID) {
        const { data, error } = await table().select('*').eq('id', id).maybeSingle();
        if (error) throw toAppError(error, `get ${name}`);
        // Ligne inexistante OU hors du périmètre de l'utilisateur : même réponse (pas d'énumération)
        if (!data) throw new NotFoundError();
        return fromRow<T>(data);
      },
      async create(input: NewEntity<T>) {
        const { data, error } = await table().insert(toInsert(input)).select('*').single();
        if (error) throw toAppError(error, `create ${name}`);
        return fromRow<T>(data);
      },
      async update(id: ID, patch: EntityPatch<T>) {
        const { data, error } = await table().update(toPatch(patch)).eq('id', id).select('*').maybeSingle();
        if (error) throw toAppError(error, `update ${name}`);
        if (!data) throw new NotFoundError();
        return fromRow<T>(data);
      },
      async remove(id: ID) {
        const { data, error } = await table().delete().eq('id', id).select('id');
        if (error) throw toAppError(error, `delete ${name}`);
        if (!data?.length) throw new NotFoundError();
      },
    };
  }

  async function invoke<R>(fn: string, body: Record<string, unknown>): Promise<R> {
    const { data, error } = await client.functions.invoke<R>(fn, { body });
    if (error) {
      const status = (error as { context?: Response }).context?.status;
      const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
      const message = (detail as { error?: string } | null)?.error;
      log.error(`fonction ${fn}`, { status, message });
      if (status === 403) throw new PermissionError(message);
      if (status === 400 || status === 409) throw new ValidationError(message ?? 'Requête refusée.');
      if (status === undefined) throw new NetworkError(error);
      throw new ApiError(status, message);
    }
    return data as R;
  }

  const accounts: AccountAdmin = {
    create: (input) => invoke<{ user: User; temporaryPassword: string }>('admin-users', { action: 'create', user: input }),
    resetPassword: (userId) => invoke<{ temporaryPassword: string }>('admin-users', { action: 'reset-password', userId }),
  };

  const resetDemoData = options.loadDemoDataset
    ? async () => {
        const dataset = await options.loadDemoDataset!();
        await invoke('demo-seed', { dataset, timezone: options.timezone?.() });
      }
    : undefined;

  async function recordRunResult(runId: ID, key: string, result: object | null): Promise<RoutineRun> {
    const { data, error } = await client.rpc('record_run_result', { p_run: runId, p_key: key, p_result: result && toInsert(result) });
    if (error) throw toAppError(error, 'record_run_result');
    return fromRow<RoutineRun>(data as Record<string, unknown>);
  }

  async function auditLog(limit: number): Promise<AuditEntry[]> {
    const { data, error } = await client.from('auditLog').select('*').order('at', { ascending: false }).limit(limit);
    if (error) throw toAppError(error, 'auditLog');
    return (data ?? []).map((r) => fromRow<AuditEntry>(r));
  }

  return { kind: 'supabase', repo, serverSideEffects: true, accounts, resetDemoData, recordRunResult, auditLog };
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ID, RoutineRun, User } from '@/types/domain';
import { ApiError, NetworkError, NotFoundError, PermissionError, ValidationError } from '@/services/errors';
import { createLogger } from '@/services/logger';
import type {
  AccountAdmin,
  AuditEntry,
  CollectionMap,
  ErpObjectType,
  ErpRecord,
  ErrorReportRow,
  IntegrationApi,
  IntegrationOutboxItem,
  IntegrationSettings,
  IntegrationStatus,
  IntegrationSyncRun,
  CollectionName,
  DataSource,
  Dataset,
  EntityPatch,
  ListFilter,
  NewEntity,
  Repository,
  TelemetryApi,
  UsageRow,
} from './types';

/* Source de données Supabase (PostgREST). Le navigateur n'est pas une frontière de sécurité :
   chaque requête est filtrée par la RLS et les triggers du serveur (supabase/migrations).
   Colonnes en camelCase : les noms des champs du domaine sont conservés tels quels. */

const log = createLogger('data:supabase');

/** Taille de page demandée (la limite « Max rows » du serveur, 1 000 par défaut, peut la réduire sans risque) */
export const PAGE_SIZE = 1000;
/** Au-delà, un avertissement technique signale une collection à charger par période */
const LARGE_COLLECTION = 5000;

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
        // Le serveur renvoie un nombre limité de lignes par requête (« Max rows »), sans signaler la coupure :
        // lecture page par page, dans un ordre stable (identifiant), jusqu'au total annoncé par le serveur.
        const pageQuery = (from: number, withCount: boolean) => {
          let query = table().select('*', withCount ? { count: 'exact' } : undefined);
          for (const [k, v] of Object.entries(filter?.where ?? {})) if (v !== undefined) query = query.eq(k, v as string);
          const range = filter?.range;
          if (range?.gte !== undefined) query = query.gte(range.field, range.gte);
          if (range?.lt !== undefined) query = query.lt(range.field, range.lt);
          return query.order('id').range(from, from + PAGE_SIZE - 1);
        };
        const rows: T[] = [];
        let total: number | null = null;
        while (total === null || rows.length < total) {
          const { data, error, count } = await pageQuery(rows.length, total === null);
          if (error) throw toAppError(error, `list ${name}`);
          if (total === null) total = count ?? 0;
          // Page vide : la table a changé pendant la lecture, on s'arrête sur ce qui a été lu
          if (!data || data.length === 0) break;
          for (const r of data) rows.push(fromRow<T>(r));
        }
        if (rows.length > LARGE_COLLECTION)
          log.warn(`${name} : ${rows.length} lignes chargées en entier (chargement par période à prévoir)`);
        return rows;
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

  async function read<T>(query: PromiseLike<{ data: unknown; error: PgError | null }>, context: string): Promise<T[]> {
    const { data, error } = await query;
    if (error) throw toAppError(error, context);
    return ((data as Record<string, unknown>[] | null) ?? []).map((r) => fromRow<T>(r));
  }

  const ERP_TYPES: ErpObjectType[] = [
    'workCenter',
    'material',
    'productionOrder',
    'stock',
    'stockMovement',
    'qualityNotification',
    'maintenanceNotification',
  ];

  // Intégration ERP : lecture des journaux (RLS : administration) ; toute opération passe par la fonction serveur
  const integration: IntegrationApi = {
    status: () => invoke<IntegrationStatus>('erp-integration', { action: 'status' }),
    async settings() {
      const [row] = await read<IntegrationSettings>(client.from('integrationSettings').select('*').eq('id', 'erp'), 'integrationSettings');
      if (!row) throw new NotFoundError('Le réglage d’intégration');
      return row;
    },
    runs: (limit) =>
      read<IntegrationSyncRun>(
        client.from('integrationSyncRuns').select('*').order('startedAt', { ascending: false }).limit(limit),
        'integrationSyncRuns',
      ),
    outbox: (limit) =>
      read<IntegrationOutboxItem>(
        client.from('integrationOutbox').select('*').order('createdAt', { ascending: false }).limit(limit),
        'integrationOutbox',
      ),
    async recordCounts() {
      const entries = await Promise.all(
        ERP_TYPES.map(async (type) => {
          const { count, error } = await client.from('erpRecords').select('id', { count: 'exact', head: true }).eq('objectType', type);
          if (error) throw toAppError(error, 'erpRecords');
          return [type, count ?? 0] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<ErpObjectType, number>;
    },
    records: (objectType, limit) =>
      read<ErpRecord>(
        client
          .from('erpRecords')
          .select('id, system, objectType, externalId, payload, simulated, sourceUpdatedAt, updatedAt')
          .eq('objectType', objectType)
          .order('externalId')
          .limit(limit),
        'erpRecords',
      ),
    async sync(options) {
      const { run } = await invoke<{ run: IntegrationSyncRun }>('erp-integration', { action: 'sync', ...options });
      return fromRow<IntegrationSyncRun>(run as unknown as Record<string, unknown>);
    },
    async processOutbox(options) {
      const { report } = await invoke<{ report: { processed: number; sent: number; retried: number; dead: number } }>('erp-integration', {
        action: 'outbox-process',
        ...options,
      });
      return report;
    },
    async retryOutbox(id) {
      await invoke('erp-integration', { action: 'outbox-retry', id });
    },
    async enqueueTest(kind) {
      await invoke('erp-integration', { action: 'outbox-test', kind });
    },
    async configure(settings) {
      await invoke('erp-integration', { action: 'configure', ...settings });
    },
  };

  // Suivi technique : écriture par fonctions serveur (contrôles et plafonds), lecture réservée à l’administration (RLS).
  // Un échec d’envoi n’est jamais signalé à l’utilisateur : le suivi ne doit pas gêner le travail.
  const telemetry: TelemetryApi = {
    async reportError(r) {
      const { error } = await client.rpc('report_client_error', {
        p_message: r.message,
        p_stack: r.stack ?? null,
        p_route: r.route,
        p_source: r.source,
        p_version: r.appVersion ?? null,
        p_agent: r.userAgent ?? null,
      });
      if (error) log.warn('Erreur non transmise', error.message);
    },
    async trackView(route) {
      const { error } = await client.rpc('track_screen_view', { p_route: route });
      if (error) log.warn('Fréquentation non transmise', error.message);
    },
    errors: (since) =>
      read<ErrorReportRow>(
        client.from('errorReports').select('*').gte('day', since).order('lastAt', { ascending: false }).limit(PAGE_SIZE),
        'errorReports',
      ),
    async usage(since) {
      // Plusieurs milliers de lignes possibles (jour × écran × rôle) : lecture par pages
      const rows: UsageRow[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const page = await read<UsageRow>(
          client
            .from('usageDaily')
            .select('day, route, role, views')
            .gte('day', since)
            .order('day')
            .order('route')
            .order('role')
            .range(from, from + PAGE_SIZE - 1),
          'usageDaily',
        );
        rows.push(...page);
        if (page.length < PAGE_SIZE) return rows;
      }
    },
  };

  return { kind: 'supabase', repo, serverSideEffects: true, accounts, resetDemoData, recordRunResult, auditLog, integration, telemetry };
}

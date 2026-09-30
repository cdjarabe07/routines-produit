import { readerFor, type ErpAdapter } from './adapter.ts';
import { contentHash } from './hash.ts';
import { ERP_OBJECT_TYPES, ErpError, ErpInvalidResponseError, ErpTimeoutError, type ErpObjectType } from './types.ts';
import { validateRecord } from './validate.ts';

/* Moteur de synchronisation ERP → application, indépendant de l'adaptateur et du stockage.
   Idempotence : chaque enregistrement est identifié par (système, type, identifiant externe) et comparé
   par empreinte de contenu → création si nouveau, mise à jour si modifié, AUCUNE écriture sinon. */

export interface ErpRecordRow {
  system: string;
  objectType: ErpObjectType;
  externalId: string;
  payload: Record<string, unknown>;
  hash: string;
  simulated: boolean;
  sourceUpdatedAt: string | null;
  lastSyncRunId: string;
}

export interface SyncStore {
  /** Empreintes déjà enregistrées pour un type : identifiant externe → empreinte */
  loadHashes(system: string, objectType: ErpObjectType): Promise<Map<string, string>>;
  /** Création ou mise à jour sur la clé (système, type, identifiant externe) */
  upsert(rows: ErpRecordRow[]): Promise<void>;
}

export type SyncStatus = 'success' | 'partial' | 'failed';

export interface TypeReport {
  read: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  error?: string;
}

export interface SyncResult {
  status: SyncStatus;
  recordsRead: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  recordsFailed: number;
  errorMessage: string | null;
  metadata: {
    perType: Partial<Record<ErpObjectType, TypeReport>>;
    rejected: { objectType: ErpObjectType; externalId?: string; error: string }[];
    duplicates: number;
    conflicts: number;
    retries: number;
  };
}

export interface CallPolicy {
  /** Délai maximal d'un appel à l'ERP */
  timeoutMs: number;
  /** Nouvelles tentatives sur erreur transitoire (indisponible, délai) */
  retries: number;
  retryDelayMs: number;
}

export const DEFAULT_CALL_POLICY: CallPolicy = { timeoutMs: 8_000, retries: 2, retryDelayMs: 400 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ErpTimeoutError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Appel protégé : délai maximal + nouvelles tentatives (avec attente croissante) sur erreur transitoire. */
export async function callErp<T>(fn: () => Promise<T>, policy: CallPolicy, onRetry: () => void = () => undefined): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withTimeout(fn(), policy.timeoutMs);
    } catch (error) {
      const transient = error instanceof ErpError && error.transient;
      if (!transient || attempt >= policy.retries) throw error;
      onRetry();
      await sleep(policy.retryDelayMs * (attempt + 1));
    }
  }
}

const MAX_REJECTS_LOGGED = 50;
const BATCH = 200;

function sourceUpdatedAt(value: Record<string, unknown>): string | null {
  const v = value.updatedAt ?? value.reportedAt ?? value.postedAt;
  return typeof v === 'string' ? v : null;
}

export async function runSync(
  adapter: ErpAdapter,
  store: SyncStore,
  options: { runId: string; types?: ErpObjectType[]; policy?: CallPolicy },
): Promise<SyncResult> {
  const policy = options.policy ?? DEFAULT_CALL_POLICY;
  const types = options.types ?? ERP_OBJECT_TYPES;
  const result: SyncResult = {
    status: 'success',
    recordsRead: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsUnchanged: 0,
    recordsFailed: 0,
    errorMessage: null,
    metadata: { perType: {}, rejected: [], duplicates: 0, conflicts: 0, retries: 0 },
  };
  const reject = (objectType: ErpObjectType, error: string, externalId?: string) => {
    result.recordsFailed++;
    if (result.metadata.rejected.length < MAX_REJECTS_LOGGED) result.metadata.rejected.push({ objectType, externalId, error });
  };
  const typeErrors: string[] = [];
  let completedTypes = 0;

  for (const type of types) {
    const report: TypeReport = { read: 0, created: 0, updated: 0, unchanged: 0, failed: 0 };
    result.metadata.perType[type] = report;

    let raw: unknown;
    try {
      raw = await callErp(readerFor(adapter, type), policy, () => result.metadata.retries++);
      if (!Array.isArray(raw)) throw new ErpInvalidResponseError(`Réponse invalide pour « ${type} » : liste attendue`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.error = message;
      if (error instanceof ErpError && error.transient) {
        // Connexion perdue : inutile d'insister sur les types suivants
        typeErrors.push(message);
        break;
      }
      typeErrors.push(message);
      continue;
    }

    report.read = raw.length;
    result.recordsRead += raw.length;

    // Validation puis regroupement par identifiant externe (détection des doublons)
    const byId = new Map<string, { value: Record<string, unknown>; hash: string; count: number; conflict: boolean }>();
    for (const item of raw) {
      const checked = validateRecord(type, item);
      if (!checked.ok) {
        report.failed++;
        reject(type, checked.error, checked.externalId);
        continue;
      }
      const value = checked.value as unknown as Record<string, unknown>;
      const hash = await contentHash(value);
      const id = value.externalId as string;
      const seen = byId.get(id);
      if (!seen) byId.set(id, { value, hash, count: 1, conflict: false });
      else {
        seen.count++;
        if (seen.hash === hash) result.metadata.duplicates++;
        else seen.conflict = true;
      }
    }

    const existing = await store.loadHashes(adapter.system, type);
    const rows: ErpRecordRow[] = [];
    for (const [externalId, entry] of byId) {
      if (entry.conflict) {
        // Même identifiant, contenus différents : aucune version n'est retenue
        result.metadata.conflicts++;
        report.failed += entry.count;
        for (let i = 0; i < entry.count; i++) reject(type, 'identifiant présent plusieurs fois avec des contenus différents', externalId);
        continue;
      }
      const previous = existing.get(externalId);
      if (previous === entry.hash) {
        report.unchanged++;
        continue;
      }
      if (previous === undefined) report.created++;
      else report.updated++;
      rows.push({
        system: adapter.system,
        objectType: type,
        externalId,
        payload: entry.value,
        hash: entry.hash,
        simulated: adapter.simulated,
        sourceUpdatedAt: sourceUpdatedAt(entry.value),
        lastSyncRunId: options.runId,
      });
    }
    for (let i = 0; i < rows.length; i += BATCH) await store.upsert(rows.slice(i, i + BATCH));

    result.recordsCreated += report.created;
    result.recordsUpdated += report.updated;
    result.recordsUnchanged += report.unchanged;
    completedTypes++;
  }

  if (completedTypes === 0) result.status = 'failed';
  else if (typeErrors.length > 0 || result.recordsFailed > 0) result.status = 'partial';
  const messages = [...typeErrors];
  if (result.recordsFailed > 0) messages.push(`${result.recordsFailed} enregistrement(s) rejeté(s)`);
  result.errorMessage = messages.length ? messages.join(' ; ').slice(0, 2000) : null;
  return result;
}

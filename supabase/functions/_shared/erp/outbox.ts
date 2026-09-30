import type { ErpAdapter } from './adapter.ts';
import { callErp, DEFAULT_CALL_POLICY, type CallPolicy } from './sync.ts';
import { ErpError, type NotificationRequest, type NotificationResult, type OutboxOperation } from './types.ts';

/* Outbox application → ERP. L'application écrit d'abord chez elle, puis l'envoi se fait ici, plus tard :
   si l'ERP est indisponible, rien n'est perdu et le terrain continue de travailler.
   - erreur transitoire (indisponible, délai) : nouvel essai programmé, attente croissante ;
   - erreur définitive (refus, données invalides) ou trop d'essais : « dead », à traiter par l'administrateur ;
   - la clé d'idempotence est transmise à l'ERP : un renvoi ne crée pas de doublon. */

export interface OutboxItem {
  id: string;
  operation: OutboxOperation;
  payload: unknown;
  idempotencyKey: string;
  /** Nombre d'essais, celui en cours inclus */
  attempts: number;
}

export interface OutboxStore {
  /** Prend en charge atomiquement les éléments dus (statut « sending ») */
  claimDue(limit: number): Promise<OutboxItem[]>;
  markSent(id: string, result: NotificationResult): Promise<void>;
  /** nextRetryAt = null : abandon définitif (« dead ») */
  markFailed(id: string, error: string, nextRetryAt: string | null): Promise<void>;
}

/** Attente avant le prochain essai : 1, 5, 15, 60 puis 240 minutes */
export function retryDelayMinutes(attempts: number): number {
  const steps = [1, 5, 15, 60, 240];
  return steps[Math.min(Math.max(attempts, 1), steps.length) - 1];
}

export function validateNotificationRequest(payload: unknown): NotificationRequest | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  if (!str(p.title, 200) || !str(p.sourceType, 40) || !str(p.sourceId, 64)) return null;
  if (!['low', 'medium', 'high'].includes(p.priority as string)) return null;
  if (p.description !== undefined && !str(p.description, 2000)) return null;
  if (p.workCenterCode !== undefined && !str(p.workCenterCode, 40)) return null;
  return p as unknown as NotificationRequest;
}

export interface OutboxReport {
  processed: number;
  sent: number;
  retried: number;
  dead: number;
}

export async function processOutbox(
  adapter: ErpAdapter,
  store: OutboxStore,
  options: { maxAttempts: number; limit?: number; now?: () => Date; policy?: CallPolicy },
): Promise<OutboxReport> {
  const now = options.now ?? (() => new Date());
  const policy = options.policy ?? DEFAULT_CALL_POLICY;
  const report: OutboxReport = { processed: 0, sent: 0, retried: 0, dead: 0 };
  const items = await store.claimDue(options.limit ?? 20);

  for (const item of items) {
    report.processed++;
    const request = validateNotificationRequest(item.payload);
    if (!request) {
      await store.markFailed(item.id, 'Contenu de l’envoi invalide : non transmis', null);
      report.dead++;
      continue;
    }
    try {
      const send =
        item.operation === 'createQualityNotification'
          ? () => adapter.createQualityNotification(request, item.idempotencyKey)
          : () => adapter.createMaintenanceNotification(request, item.idempotencyKey);
      const result = await callErp(send, policy);
      await store.markSent(item.id, result);
      report.sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const transient = error instanceof ErpError && error.transient;
      if (!transient || item.attempts >= options.maxAttempts) {
        await store.markFailed(item.id, message, null);
        report.dead++;
      } else {
        const next = new Date(now().getTime() + retryDelayMinutes(item.attempts) * 60_000).toISOString();
        await store.markFailed(item.id, message, next);
        report.retried++;
      }
    }
  }
  return report;
}

import type { OutboxItem, OutboxStore } from '../../supabase/functions/_shared/erp/outbox.ts';
import type { ErpRecordRow, SyncStore } from '../../supabase/functions/_shared/erp/sync.ts';
import type { ErpObjectType, NotificationResult } from '../../supabase/functions/_shared/erp/types.ts';

/** Équivalent en mémoire de la table erpRecords (clé unique système + type + identifiant externe). */
export class MemorySyncStore implements SyncStore {
  readonly rows = new Map<string, ErpRecordRow>();
  writes = 0;

  private key(system: string, type: string, id: string) {
    return `${system}|${type}|${id}`;
  }

  async loadHashes(system: string, objectType: ErpObjectType) {
    const out = new Map<string, string>();
    for (const r of this.rows.values()) if (r.system === system && r.objectType === objectType) out.set(r.externalId, r.hash);
    return out;
  }

  async upsert(rows: ErpRecordRow[]) {
    for (const r of rows) {
      this.writes++;
      this.rows.set(this.key(r.system, r.objectType, r.externalId), structuredClone(r));
    }
  }

  count(type?: ErpObjectType) {
    return [...this.rows.values()].filter((r) => !type || r.objectType === type).length;
  }

  get(type: ErpObjectType, id: string) {
    return this.rows.get(this.key('SAP', type, id));
  }
}

export interface MemoryOutboxEntry extends OutboxItem {
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'dead';
  nextRetryAt: string;
  lastError?: string;
  externalId?: string;
}

/** Équivalent en mémoire de integrationOutbox + integration_claim_outbox. */
export class MemoryOutboxStore implements OutboxStore {
  readonly items: MemoryOutboxEntry[] = [];
  constructor(private readonly now: () => Date) {}

  enqueue(item: Pick<OutboxItem, 'id' | 'operation' | 'payload' | 'idempotencyKey'>) {
    this.items.push({ ...item, attempts: 0, status: 'pending', nextRetryAt: this.now().toISOString() });
  }

  async claimDue(limit: number) {
    const due = this.items
      .filter((i) => (i.status === 'pending' || i.status === 'failed') && i.nextRetryAt <= this.now().toISOString())
      .slice(0, limit);
    for (const i of due) {
      i.status = 'sending';
      i.attempts++;
    }
    return due.map((i) => ({ ...i }));
  }

  async markSent(id: string, result: NotificationResult) {
    const i = this.items.find((x) => x.id === id)!;
    i.status = 'sent';
    i.externalId = result.externalId;
    i.lastError = undefined;
  }

  async markFailed(id: string, error: string, nextRetryAt: string | null) {
    const i = this.items.find((x) => x.id === id)!;
    i.status = nextRetryAt ? 'failed' : 'dead';
    i.lastError = error;
    if (nextRetryAt) i.nextRetryAt = nextRetryAt;
  }
}

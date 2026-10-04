// Stockage Supabase de l'intégration ERP (clé de service, côté serveur uniquement), limité à une entreprise.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4';
import type { OutboxItem, OutboxStore } from './erp/outbox.ts';
import type { ErpRecordRow, SyncStore } from './erp/sync.ts';
import type { ErpObjectType, NotificationResult } from './erp/types.ts';

const PAGE = 1000;

export function supabaseSyncStore(admin: SupabaseClient, companyId: string): SyncStore {
  return {
    async loadHashes(system: string, objectType: ErpObjectType) {
      const out = new Map<string, string>();
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
          .from('erpRecords')
          .select('externalId, hash')
          .eq('companyId', companyId)
          .eq('system', system)
          .eq('objectType', objectType)
          .order('externalId')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const r of data ?? []) out.set(r.externalId as string, r.hash as string);
        if (!data || data.length < PAGE) return out;
      }
    },
    async upsert(rows: ErpRecordRow[]) {
      const { error } = await admin.from('erpRecords').upsert(
        rows.map((r) => ({ ...r, companyId })),
        { onConflict: 'companyId,system,objectType,externalId' },
      );
      if (error) throw error;
    },
  };
}

export function supabaseOutboxStore(admin: SupabaseClient, companyId: string): OutboxStore {
  return {
    async claimDue(limit: number) {
      const { data, error } = await admin.rpc('integration_claim_outbox', { p_limit: limit, p_company: companyId });
      if (error) throw error;
      return (data ?? []) as OutboxItem[];
    },
    async markSent(id: string, result: NotificationResult) {
      const { error } = await admin
        .from('integrationOutbox')
        .update({ status: 'sent', externalId: result.externalId, sentAt: new Date().toISOString(), lastError: null })
        .eq('id', id)
        .eq('companyId', companyId);
      if (error) throw error;
    },
    async markFailed(id: string, message: string, nextRetryAt: string | null) {
      const patch = nextRetryAt
        ? { status: 'failed', lastError: message.slice(0, 2000), nextRetryAt }
        : { status: 'dead', lastError: message.slice(0, 2000) };
      const { error } = await admin.from('integrationOutbox').update(patch).eq('id', id).eq('companyId', companyId);
      if (error) throw error;
    },
  };
}

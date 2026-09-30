import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, as, callFunction, configured, tokenOf } from './helpers';

/* Intégration ERP (Mock SAP) contre le serveur de démonstration : droits, idempotence réelle en base,
   scénarios d'erreur, outbox. Voir docs/ERP_INTEGRATION.md. */

const suite = configured ? describe : describe.skip;
const TABLES = ['erpRecords', 'externalReferences', 'integrationSyncRuns', 'integrationOutbox', 'integrationSettings'];

type Run = {
  id: string;
  status: string;
  mode: string;
  recordsRead: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  recordsFailed: number;
  errorMessage: string | null;
};

async function erp(action: string, body: Record<string, unknown> = {}, who: 'admin' | 'manager' | 'operatorA' = 'admin') {
  return callFunction('erp-integration', { action, ...body }, { token: await tokenOf(await as(who)) });
}

async function sync(body: Record<string, unknown> = {}): Promise<Run> {
  const res = await erp('sync', body);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body as { run: Run }).run;
}

async function recordCount(admin: SupabaseClient) {
  return (await admin.from('erpRecords').select('id', { count: 'exact', head: true })).count ?? 0;
}

suite('ERP — droits d’accès', () => {
  it.each(['operatorA', 'manager'] as const)('%s ne lit aucune table d’intégration', async (who) => {
    const client = await as(who);
    for (const table of TABLES) {
      const { data } = await client.from(table).select('*').limit(1);
      expect(data ?? [], table).toHaveLength(0);
    }
  });

  it('un visiteur non connecté ne lit rien', async () => {
    for (const table of TABLES) {
      const { data, error } = await anonClient().from(table).select('*').limit(1);
      expect(error !== null || (data ?? []).length === 0, table).toBe(true);
    }
  });

  it('l’administrateur lit mais n’écrit pas directement (écriture réservée au serveur)', async () => {
    const admin = await as('admin');
    const { data: settings } = await admin.from('integrationSettings').select('*').single();
    expect(settings).toBeTruthy();
    const insert = await admin.from('erpRecords').insert({
      system: 'SAP',
      objectType: 'material',
      externalId: 'MAT-FORGE',
      payload: {},
      hash: '0'.repeat(64),
      simulated: false,
    });
    expect(insert.error).not.toBeNull();
    const update = await admin.from('integrationSettings').update({ outboundEnabled: true }).eq('id', 'erp').select();
    expect(update.error !== null || (update.data ?? []).length === 0).toBe(true);
    const outbox = await admin.from('integrationOutbox').insert({
      target: 'SAP',
      entityType: 'x',
      entityId: 'x',
      operation: 'createQualityNotification',
      payload: {},
      idempotencyKey: 'forge-000001',
      simulated: false,
    });
    expect(outbox.error).not.toBeNull();
  });

  it.each(['operatorA', 'manager'] as const)('%s ne peut pas appeler la fonction d’intégration', async (who) => {
    for (const action of ['status', 'sync', 'outbox-process', 'configure']) {
      const res = await erp(action, { outboundEnabled: true }, who);
      expect(res.status, action).toBe(403);
    }
  });

  it('la prise en charge de l’outbox n’est pas appelable par un client', async () => {
    const { error } = await (await as('admin')).rpc('integration_claim_outbox', { p_limit: 5 });
    expect(error).not.toBeNull();
  });
});

suite('ERP — synchronisation Mock SAP', () => {
  it('le serveur annonce le mode simulation et ses scénarios', async () => {
    const res = await erp('status');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ mode: 'mock', system: 'SAP' });
    expect((res.body as { scenarios: unknown[] }).scenarios.length).toBeGreaterThanOrEqual(8);
  });

  it('synchronisations répétées : aucun doublon, aucune réécriture', async () => {
    const admin = await as('admin');
    await sync({ dataVersion: 1 });
    const count = await recordCount(admin);
    const second = await sync({ dataVersion: 1 });
    expect(second.status).toBe('success');
    expect(second.recordsCreated).toBe(0);
    expect(second.recordsUpdated).toBe(0);
    expect(second.recordsUnchanged).toBe(second.recordsRead);
    expect(await recordCount(admin)).toBe(count);
    const { data } = await admin.from('erpRecords').select('simulated').eq('simulated', false);
    expect(data ?? []).toHaveLength(0);
  });

  it('données modifiées puis nouvelles : mise à jour et création, puis retour à l’état initial', async () => {
    const v2 = await sync({ dataVersion: 2 });
    expect(v2.status).toBe('success');
    expect(v2.recordsUpdated).toBeGreaterThan(0);
    // Les nouveaux ordres de la version 2 sont présents (créés maintenant ou lors d'une exécution précédente : jamais en double)
    const admin = await as('admin');
    const { data } = await admin
      .from('erpRecords')
      .select('payload, lastSyncRunId')
      .eq('objectType', 'productionOrder')
      .eq('externalId', 'PO-1004572')
      .single();
    expect((data!.payload as { status: string }).status).toBe('completed');
    const { data: added } = await admin
      .from('erpRecords')
      .select('externalId')
      .eq('objectType', 'productionOrder')
      .in('externalId', ['PO-1004581', 'PO-1004582']);
    expect(added ?? []).toHaveLength(2);
    expect(data!.lastSyncRunId).toBe(v2.id);
    const back = await sync({ dataVersion: 1 });
    expect(back.recordsUpdated).toBe(v2.recordsUpdated);
    expect(back.recordsCreated).toBe(0);
  });

  it('SAP indisponible : synchronisation en échec, aucune donnée modifiée', async () => {
    const admin = await as('admin');
    const before = await recordCount(admin);
    const run = await sync({ scenario: 'unavailable' });
    expect(run.status).toBe('failed');
    expect(run.errorMessage).toMatch(/indisponible/);
    expect(await recordCount(admin)).toBe(before);
  });

  it('erreur partielle : les enregistrements invalides sont rejetés et journalisés', async () => {
    const run = await sync({ scenario: 'partial' });
    expect(run.status).toBe('partial');
    expect(run.recordsFailed).toBe(3);
  });

  it('chaque synchronisation est journalisée (historique et journal d’audit)', async () => {
    const admin = await as('admin');
    const { data: runs } = await admin
      .from('integrationSyncRuns')
      .select('status, finishedAt')
      .order('startedAt', { ascending: false })
      .limit(3);
    expect(runs!.every((r) => r.finishedAt)).toBe(true);
    const { data: audit } = await admin.from('auditLog').select('event').eq('event', 'ERP_SYNC').limit(1);
    expect(audit ?? []).toHaveLength(1);
  });
});

suite('ERP — outbox', () => {
  let itemId: string;

  beforeAll(async () => {
    const res = await erp('outbox-test', { kind: 'quality' });
    expect(res.status).toBe(200);
    itemId = (res.body as { item: { id: string } }).item.id;
  });

  afterAll(async () => {
    // Remise dans l'état par défaut : envoi sortant désactivé
    await erp('configure', { outboundEnabled: false });
  });

  it('envoi sortant désactivé par défaut : aucun traitement', async () => {
    await erp('configure', { outboundEnabled: false });
    const res = await erp('outbox-process');
    expect(res.status).toBe(409);
  });

  it('erreur d’envoi : nouvel essai programmé ; relance ; puis envoi réussi', async () => {
    const admin = await as('admin');
    expect((await erp('configure', { outboundEnabled: true })).status).toBe(200);

    const failed = await erp('outbox-process', { scenario: 'send_error' });
    expect(failed.status).toBe(200);
    let { data: item } = await admin.from('integrationOutbox').select('*').eq('id', itemId).single();
    expect(item).toMatchObject({ status: 'failed', attempts: 1 });
    expect(new Date(item!.nextRetryAt).getTime()).toBeGreaterThan(Date.now());
    expect(item!.lastError).toMatch(/envoi impossible/);

    expect((await erp('outbox-retry', { id: itemId })).status).toBe(200);
    expect((await erp('outbox-process')).status).toBe(200);
    ({ data: item } = await admin.from('integrationOutbox').select('*').eq('id', itemId).single());
    expect(item).toMatchObject({ status: 'sent', simulated: true });
    expect(item!.externalId).toMatch(/^QN-2009\d{4}$/);
    expect(item!.sentAt).toBeTruthy();
  });

  it('un envoi réussi ne peut pas être relancé', async () => {
    expect((await erp('outbox-retry', { id: itemId })).status).toBe(409);
  });
});

/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { createErpAdapter, parseIntegrationMode, parseScenario } from '../../supabase/functions/_shared/erp/factory.ts';
import { contentHash, stableStringify } from '../../supabase/functions/_shared/erp/hash.ts';
import { MOCK_SCENARIOS, MockSapAdapter } from '../../supabase/functions/_shared/erp/mockSapAdapter.ts';
import { buildMockDataset } from '../../supabase/functions/_shared/erp/mockSapData.ts';
import { processOutbox, retryDelayMinutes } from '../../supabase/functions/_shared/erp/outbox.ts';
import { runSync, type CallPolicy } from '../../supabase/functions/_shared/erp/sync.ts';
import { ERP_OBJECT_TYPES, ErpNotConfiguredError, type ErpObjectType } from '../../supabase/functions/_shared/erp/types.ts';
import { validateRecord } from '../../supabase/functions/_shared/erp/validate.ts';
import { MemoryOutboxStore, MemorySyncStore } from './memoryStores';

const REF = new Date('2026-09-30T10:00:00Z');
const FAST: CallPolicy = { timeoutMs: 50, retries: 2, retryDelayMs: 1 };
const mock = (options: ConstructorParameters<typeof MockSapAdapter>[0] = {}) => new MockSapAdapter({ referenceDate: REF, ...options });
const sync = (adapter: MockSapAdapter, store: MemorySyncStore, runId = 'run') => runSync(adapter, store, { runId, policy: FAST });

describe('Mock SAP — données', () => {
  it('toutes les données simulées sont valides et marquées comme simulation', async () => {
    const adapter = mock();
    expect(adapter.simulated).toBe(true);
    expect(adapter.label).toMatch(/Mock SAP/);
    const readers: Record<ErpObjectType, () => Promise<unknown[]>> = {
      workCenter: () => adapter.getWorkCenters(),
      material: () => adapter.getMaterials(),
      productionOrder: () => adapter.getProductionOrders(),
      stock: () => adapter.getMaterialStocks(),
      stockMovement: () => adapter.getStockMovements(),
      qualityNotification: () => adapter.getQualityNotifications(),
      maintenanceNotification: () => adapter.getMaintenanceNotifications(),
    };
    for (const type of ERP_OBJECT_TYPES) {
      const rows = await readers[type]();
      expect(rows.length, type).toBeGreaterThan(0);
      for (const row of rows) expect(validateRecord(type, row).ok, `${type} ${JSON.stringify(row)}`).toBe(true);
    }
  });

  it('les références sont cohérentes (articles et postes existent)', () => {
    const d = buildMockDataset(REF, 2);
    const materials = new Set(d.materials.map((m) => m.materialNumber));
    const centers = new Set(d.workCenters.map((w) => w.code));
    for (const o of d.productionOrders) {
      expect(materials.has(o.materialNumber)).toBe(true);
      expect(centers.has(o.workCenterCode!)).toBe(true);
      expect(o.confirmedQuantity).toBeLessThanOrEqual(o.plannedQuantity);
    }
    for (const s of d.stocks) expect(materials.has(s.materialNumber)).toBe(true);
  });

  it('les données sont déterministes (mêmes paramètres → mêmes données)', () => {
    expect(stableStringify(buildMockDataset(REF, 1))).toBe(stableStringify(buildMockDataset(new Date('2026-10-02T18:00:00Z'), 1)));
  });
});

describe('Synchronisation et idempotence', () => {
  it('première synchronisation : tout est créé', async () => {
    const store = new MemorySyncStore();
    const r = await sync(mock(), store);
    expect(r.status).toBe('success');
    expect(r.recordsCreated).toBe(r.recordsRead);
    expect(r.recordsUpdated + r.recordsUnchanged + r.recordsFailed).toBe(0);
    expect(store.count()).toBe(r.recordsRead);
    expect([...store.rows.values()].every((row) => row.simulated)).toBe(true);
  });

  it('deuxième synchronisation identique : aucune création, aucune écriture', async () => {
    const store = new MemorySyncStore();
    await sync(mock(), store, 'r1');
    const count = store.count();
    const writes = store.writes;
    const r = await sync(mock(), store, 'r2');
    expect(r.status).toBe('success');
    expect(r.recordsCreated).toBe(0);
    expect(r.recordsUpdated).toBe(0);
    expect(r.recordsUnchanged).toBe(r.recordsRead);
    expect(store.count()).toBe(count);
    expect(store.writes).toBe(writes);
  });

  it('données modifiées : mise à jour ; nouvelles données : création', async () => {
    const store = new MemorySyncStore();
    await sync(mock({ dataVersion: 1 }), store, 'r1');
    const r = await sync(mock({ dataVersion: 2 }), store, 'r2');
    const orders = r.metadata.perType.productionOrder!;
    expect(orders.updated).toBe(3);
    expect(orders.created).toBe(2);
    expect(r.metadata.perType.stock!.updated).toBe(2);
    expect(r.metadata.perType.stockMovement!.created).toBe(1);
    expect(r.metadata.perType.qualityNotification!.updated).toBe(1);
    expect(store.get('productionOrder', 'PO-1004572')!.payload.status).toBe('completed');
    expect(store.get('productionOrder', 'PO-1004572')!.lastSyncRunId).toBe('r2');
    expect(store.get('productionOrder', 'PO-1004571')!.lastSyncRunId).toBe('r1');
  });

  it('l’empreinte ne dépend pas de l’ordre des champs', async () => {
    expect(await contentHash({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(await contentHash({ b: [1, { d: 3, c: 2 }], a: 1 }));
  });
});

describe('Scénarios d’erreur du Mock SAP', () => {
  it('SAP indisponible : échec, aucune donnée écrite', async () => {
    const store = new MemorySyncStore();
    const r = await sync(mock({ scenario: 'unavailable' }), store);
    expect(r.status).toBe('failed');
    expect(r.errorMessage).toMatch(/indisponible/);
    expect(r.metadata.retries).toBe(FAST.retries);
    expect(store.count()).toBe(0);
  });

  it('délai dépassé : l’appel est interrompu, échec', async () => {
    const r = await sync(mock({ scenario: 'timeout' }), new MemorySyncStore());
    expect(r.status).toBe('failed');
    expect(r.errorMessage).toMatch(/Délai/);
  });

  it('réponse invalide : type rejeté, les autres types sont synchronisés', async () => {
    const store = new MemorySyncStore();
    const r = await sync(mock({ scenario: 'invalid' }), store);
    expect(r.status).toBe('partial');
    expect(r.metadata.perType.productionOrder!.error).toMatch(/invalide/);
    expect(store.count('productionOrder')).toBe(0);
    expect(store.count('material')).toBeGreaterThan(0);
  });

  it('doublons : identique ignoré, contradictoire rejeté', async () => {
    const store = new MemorySyncStore();
    const r = await sync(mock({ scenario: 'duplicate' }), store);
    expect(r.status).toBe('partial');
    expect(r.metadata.duplicates).toBe(1);
    expect(r.metadata.conflicts).toBe(1);
    expect(store.get('productionOrder', 'PO-1004571')).toBeDefined();
    expect(store.get('productionOrder', 'PO-1004572')).toBeUndefined();
    expect(store.count('productionOrder')).toBe(9);
  });

  it('erreur partielle : les enregistrements invalides sont rejetés, les autres enregistrés', async () => {
    const store = new MemorySyncStore();
    const r = await sync(mock({ scenario: 'partial' }), store);
    expect(r.status).toBe('partial');
    expect(r.recordsFailed).toBe(3);
    expect(r.metadata.rejected.map((x) => x.externalId)).toEqual(expect.arrayContaining(['PO-1004590', 'PO-1004591', 'STK-INVALIDE']));
    expect(store.count('productionOrder')).toBe(10);
  });

  it('reprise après erreur : le premier appel échoue, la nouvelle tentative réussit', async () => {
    const store = new MemorySyncStore();
    const r = await sync(mock({ scenario: 'recovery' }), store);
    expect(r.status).toBe('success');
    expect(r.metadata.retries).toBe(ERP_OBJECT_TYPES.length);
    expect(store.count()).toBe(r.recordsRead);
  });

  it('synchronisation réussie après une panne : rien n’est perdu ni dupliqué', async () => {
    const store = new MemorySyncStore();
    await sync(mock({ scenario: 'unavailable' }), store);
    const r = await sync(mock(), store);
    expect(r.status).toBe('success');
    expect(r.recordsCreated).toBe(r.recordsRead);
  });

  it('chaque scénario a un libellé et est reconnu', () => {
    for (const s of MOCK_SCENARIOS) expect(parseScenario(s)).toBe(s);
    expect(parseScenario('inconnu')).toBe('success');
  });
});

describe('Outbox', () => {
  const request = { title: 'Défaut de sertissage', priority: 'high', sourceType: 'anomaly', sourceId: 'an-1', workCenterCode: 'CAB-P1' };

  function setup(start = REF) {
    let now = start;
    const store = new MemoryOutboxStore(() => now);
    return { store, advance: (minutes: number) => (now = new Date(now.getTime() + minutes * 60_000)), now: () => now };
  }

  it('envoi réussi : statut « sent » avec l’identifiant renvoyé', async () => {
    const { store, now } = setup();
    store.enqueue({ id: 'o1', operation: 'createQualityNotification', payload: request, idempotencyKey: 'anomaly:an-1:quality' });
    const r = await processOutbox(mock(), store, { maxAttempts: 5, now, policy: FAST });
    expect(r).toMatchObject({ processed: 1, sent: 1 });
    expect(store.items[0].status).toBe('sent');
    expect(store.items[0].externalId).toMatch(/^QN-2009\d{4}$/);
  });

  it('envoi en erreur : nouvel essai programmé, puis réussite quand l’ERP revient', async () => {
    const { store, advance, now } = setup();
    store.enqueue({ id: 'o1', operation: 'createMaintenanceNotification', payload: request, idempotencyKey: 'andon:ad-1:maint' });
    const first = await processOutbox(mock({ scenario: 'send_error' }), store, { maxAttempts: 5, now, policy: FAST });
    expect(first.retried).toBe(1);
    expect(store.items[0].status).toBe('failed');
    expect(store.items[0].lastError).toMatch(/envoi impossible/);
    // Pas encore dû : rien n'est repris
    expect((await processOutbox(mock(), store, { maxAttempts: 5, now, policy: FAST })).processed).toBe(0);
    advance(retryDelayMinutes(1));
    const second = await processOutbox(mock(), store, { maxAttempts: 5, now, policy: FAST });
    expect(second.sent).toBe(1);
    expect(store.items[0]).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('trop d’essais : abandon (« dead »)', async () => {
    const { store, advance, now } = setup();
    store.enqueue({ id: 'o1', operation: 'createQualityNotification', payload: request, idempotencyKey: 'k-dead-0001' });
    for (let i = 0; i < 3; i++) {
      await processOutbox(mock({ scenario: 'send_error' }), store, { maxAttempts: 3, now, policy: FAST });
      advance(300);
    }
    expect(store.items[0]).toMatchObject({ status: 'dead', attempts: 3 });
  });

  it('refus définitif ou contenu invalide : abandon immédiat, sans nouvel essai', async () => {
    const { store, now } = setup();
    store.enqueue({ id: 'o1', operation: 'createQualityNotification', payload: request, idempotencyKey: 'k-reject-01' });
    store.enqueue({ id: 'o2', operation: 'createQualityNotification', payload: { title: '' }, idempotencyKey: 'k-invalid-1' });
    const r = await processOutbox(mock({ scenario: 'send_rejected' }), store, { maxAttempts: 5, now, policy: FAST });
    expect(r.dead).toBe(2);
    expect(store.items.map((i) => i.attempts)).toEqual([1, 1]);
  });

  it('idempotence de l’envoi : même clé → même avis, même depuis une autre exécution', async () => {
    const a = await mock().createQualityNotification(request as never, 'anomaly:an-1:quality');
    const b = await mock().createQualityNotification(request as never, 'anomaly:an-1:quality');
    const c = await mock().createQualityNotification(request as never, 'anomaly:an-2:quality');
    expect(a).toEqual(b);
    expect(c.externalId).not.toBe(a.externalId);
  });

  it('attente croissante entre les essais', () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelayMinutes)).toEqual([1, 5, 15, 60, 240, 240]);
  });
});

describe('Réglage SAP_INTEGRATION_MODE', () => {
  it('mock par défaut, valeur inconnue → désactivé', () => {
    expect(parseIntegrationMode(undefined)).toBe('mock');
    expect(parseIntegrationMode('MOCK')).toBe('mock');
    expect(parseIntegrationMode('real')).toBe('real');
    expect(parseIntegrationMode('sap-prod')).toBe('off');
  });

  it('le connecteur réel n’existe pas : refus explicite, aucune connexion', () => {
    expect(() => createErpAdapter('real')).toThrow(ErpNotConfiguredError);
    expect(() => createErpAdapter('off')).toThrow(/désactivée/);
    expect(createErpAdapter('mock')).toBeInstanceOf(MockSapAdapter);
  });
});

describe('Séparation navigateur / serveur', () => {
  it('aucun fichier du frontend n’importe le code d’intégration ni ne lit le réglage serveur', () => {
    const files = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(50);
    const offenders = Object.entries(files)
      // Import du code serveur, ou lecture d'une variable d'environnement serveur (seules les VITE_* sont publiques)
      .filter(([, code]) => /from ['"][^'"]*(supabase\/functions|_shared\/erp)|Deno\.env|import\.meta\.env\.SAP_|process\.env/.test(code))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});

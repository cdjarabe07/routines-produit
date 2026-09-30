// Intégration ERP (préparation SAP), réservée à l'administration (permission settings.manage).
// Le navigateur ne voit jamais l'adaptateur ni aucun point d'accès ERP : il appelle cette fonction.
// Actions :
// - status        : mode configuré côté serveur (SAP_INTEGRATION_MODE) et scénarios du Mock SAP ;
// - sync          : synchronisation ERP → application, journalisée (integrationSyncRuns + journal d'audit) ;
// - outbox-process: envoi des éléments dus de l'outbox (si l'envoi sortant est activé) ;
// - outbox-retry  : remet un envoi en échec ou abandonné dans la file ;
// - outbox-test   : crée un envoi de test (Mock SAP uniquement) ;
// - configure     : active ou désactive l'envoi sortant.
// Aucune donnée n'est aujourd'hui placée automatiquement dans l'outbox par l'application.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4';
import { audit, callerWithPermission, corsHeaders, json, serviceClient } from '../_shared/http.ts';
import { supabaseOutboxStore, supabaseSyncStore } from '../_shared/erp-store.ts';
import { createErpAdapter, parseIntegrationMode, parseScenario } from '../_shared/erp/factory.ts';
import { MOCK_SCENARIO_LABELS, MOCK_SCENARIOS } from '../_shared/erp/mockSapAdapter.ts';
import { processOutbox } from '../_shared/erp/outbox.ts';
import { runSync, type CallPolicy } from '../_shared/erp/sync.ts';
import { ErpError, type IntegrationMode } from '../_shared/erp/types.ts';

const SYSTEM = 'SAP';
// Mock : délais courts pour que les scénarios d'erreur restent rapides à observer
const MOCK_POLICY: CallPolicy = { timeoutMs: 3_000, retries: 2, retryDelayMs: 300 };

const TEST_REQUESTS = {
  quality: {
    operation: 'createQualityNotification',
    payload: {
      title: 'Test d’intégration — défaut de sertissage',
      description: 'Envoi de test créé depuis l’administration (Mock SAP).',
      workCenterCode: 'CAB-P1',
      priority: 'medium',
      sourceType: 'integrationTest',
    },
  },
  maintenance: {
    operation: 'createMaintenanceNotification',
    payload: {
      title: 'Test d’intégration — outil de sertissage à vérifier',
      description: 'Envoi de test créé depuis l’administration (Mock SAP).',
      workCenterCode: 'CAB-P1',
      priority: 'low',
      sourceType: 'integrationTest',
    },
  },
} as const;

interface Context {
  req: Request;
  admin: SupabaseClient;
  actorId: string;
  mode: IntegrationMode;
  body: Record<string, unknown>;
}

async function sync({ req, admin, actorId, mode, body }: Context): Promise<Response> {
  if (mode === 'off') return json(req, 409, { error: 'Intégration ERP désactivée sur le serveur.' });
  const scenario = mode === 'mock' ? parseScenario(body.scenario) : null;
  const dataVersion = body.dataVersion === 2 ? 2 : 1;

  // Synchronisation restée « en cours » après un arrêt brutal : clôturée pour ne pas bloquer les suivantes
  await admin
    .from('integrationSyncRuns')
    .update({ status: 'failed', finishedAt: new Date().toISOString(), errorMessage: 'Interrompue (délai dépassé)' })
    .eq('source', SYSTEM)
    .eq('status', 'running')
    .lt('startedAt', new Date(Date.now() - 15 * 60_000).toISOString());

  const { data: run, error: startError } = await admin
    .from('integrationSyncRuns')
    .insert({
      source: SYSTEM,
      mode: mode === 'real' ? 'real' : 'mock',
      scenario,
      status: 'running',
      triggeredBy: actorId,
      metadata: mode === 'mock' ? { dataVersion, simulated: true } : {},
    })
    .select('id')
    .single();
  if (startError) {
    if (startError.code === '23505') return json(req, 409, { error: 'Une synchronisation est déjà en cours.' });
    throw startError;
  }

  const finish = async (patch: Record<string, unknown>) => {
    const { data } = await admin
      .from('integrationSyncRuns')
      .update({ ...patch, finishedAt: new Date().toISOString() })
      .eq('id', run.id)
      .select()
      .single();
    await audit(admin, actorId, 'ERP_SYNC', 'integrationSyncRuns', run.id, {
      mode,
      scenario,
      status: patch.status,
      created: patch.recordsCreated ?? 0,
      updated: patch.recordsUpdated ?? 0,
      failed: patch.recordsFailed ?? 0,
    });
    return data;
  };

  try {
    const adapter = createErpAdapter(mode, { scenario: scenario ?? undefined, dataVersion });
    const result = await runSync(adapter, supabaseSyncStore(admin), {
      runId: run.id,
      policy: mode === 'mock' ? MOCK_POLICY : undefined,
    });
    const saved = await finish({
      status: result.status,
      recordsRead: result.recordsRead,
      recordsCreated: result.recordsCreated,
      recordsUpdated: result.recordsUpdated,
      recordsUnchanged: result.recordsUnchanged,
      recordsFailed: result.recordsFailed,
      errorMessage: result.errorMessage,
      metadata: { ...(mode === 'mock' ? { dataVersion, simulated: true } : {}), ...result.metadata },
    });
    return json(req, 200, { run: saved });
  } catch (error) {
    // Erreur ERP connue : message lisible ; autre erreur : détail dans les journaux serveur seulement
    console.error('erp-integration sync', error);
    const message = error instanceof ErpError ? error.message : 'Erreur interne pendant la synchronisation.';
    return json(req, 200, { run: await finish({ status: 'failed', errorMessage: message }) });
  }
}

async function outboxProcess({ req, admin, actorId, mode, body }: Context): Promise<Response> {
  if (mode === 'off') return json(req, 409, { error: 'Intégration ERP désactivée sur le serveur.' });
  const { data: settings, error } = await admin.from('integrationSettings').select('*').eq('id', 'erp').single();
  if (error) throw error;
  if (!settings.outboundEnabled) return json(req, 409, { error: 'L’envoi vers l’ERP est désactivé.' });
  const adapter = createErpAdapter(mode, { scenario: mode === 'mock' ? parseScenario(body.scenario) : undefined });
  const report = await processOutbox(adapter, supabaseOutboxStore(admin), {
    maxAttempts: settings.maxAttempts,
    policy: mode === 'mock' ? MOCK_POLICY : undefined,
  });
  await audit(admin, actorId, 'ERP_OUTBOX_PROCESSED', 'integrationOutbox', null, { mode, ...report });
  return json(req, 200, { report });
}

async function outboxRetry({ req, admin, actorId, body }: Context): Promise<Response> {
  if (typeof body.id !== 'string' || body.id.length > 64) return json(req, 400, { error: 'Élément invalide.' });
  // Relance manuelle : nouveau cycle d'essais
  const { data, error } = await admin
    .from('integrationOutbox')
    .update({ status: 'pending', attempts: 0, nextRetryAt: new Date().toISOString() })
    .eq('id', body.id)
    .in('status', ['failed', 'dead'])
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return json(req, 409, { error: 'Seul un envoi en échec ou abandonné peut être relancé.' });
  await audit(admin, actorId, 'ERP_OUTBOX_RETRY', 'integrationOutbox', data.id);
  return json(req, 200, { item: data });
}

async function outboxTest({ req, admin, actorId, mode, body }: Context): Promise<Response> {
  if (mode !== 'mock') return json(req, 409, { error: 'Envoi de test disponible uniquement avec le Mock SAP.' });
  const test = body.kind === 'maintenance' ? TEST_REQUESTS.maintenance : TEST_REQUESTS.quality;
  const entityId = crypto.randomUUID();
  const { data, error } = await admin
    .from('integrationOutbox')
    .insert({
      target: SYSTEM,
      entityType: 'integrationTest',
      entityId,
      operation: test.operation,
      payload: { ...test.payload, sourceId: entityId },
      idempotencyKey: `integrationTest:${entityId}`,
      simulated: true,
      createdBy: actorId,
    })
    .select()
    .single();
  if (error) throw error;
  await audit(admin, actorId, 'ERP_OUTBOX_TEST_ENQUEUED', 'integrationOutbox', data.id, { operation: test.operation });
  return json(req, 200, { item: data });
}

async function configure({ req, admin, actorId, body }: Context): Promise<Response> {
  if (typeof body.outboundEnabled !== 'boolean') return json(req, 400, { error: 'Réglage invalide.' });
  const { data, error } = await admin
    .from('integrationSettings')
    .update({ outboundEnabled: body.outboundEnabled })
    .eq('id', 'erp')
    .select()
    .single();
  if (error) throw error;
  await audit(admin, actorId, 'ERP_SETTINGS_CHANGED', 'integrationSettings', 'erp', { outboundEnabled: body.outboundEnabled });
  return json(req, 200, { settings: data });
}

const ACTIONS: Record<string, (ctx: Context) => Promise<Response>> = {
  sync,
  'outbox-process': outboxProcess,
  'outbox-retry': outboxRetry,
  'outbox-test': outboxTest,
  configure,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Méthode non autorisée.' });
  const admin = serviceClient();
  const caller = await callerWithPermission(admin, req, 'settings.manage');
  if (!caller) {
    await audit(admin, null, 'PERMISSION_DENIED', 'erp-integration', null, { reason: 'appel sans droit d’administration' });
    return json(req, 403, { error: 'Accès refusé.' });
  }
  const mode = parseIntegrationMode(Deno.env.get('SAP_INTEGRATION_MODE'));
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === 'status') {
    return json(req, 200, {
      mode,
      system: SYSTEM,
      scenarios: mode === 'mock' ? MOCK_SCENARIOS.map((id) => ({ id, label: MOCK_SCENARIO_LABELS[id] })) : [],
    });
  }
  const handler = typeof body.action === 'string' ? ACTIONS[body.action] : undefined;
  if (!handler) return json(req, 400, { error: 'Action inconnue.' });
  try {
    return await handler({ req, admin, actorId: caller.appUserId, mode, body });
  } catch (error) {
    console.error('erp-integration', error);
    if (error instanceof ErpError) return json(req, 409, { error: error.message });
    return json(req, 500, { error: 'Opération impossible. Consultez les journaux du serveur.' });
  }
});

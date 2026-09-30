import { useState } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { RefreshCw, Send } from 'lucide-react';
import { useDataSource } from '@/app/providers/DataSourceProvider';
import { KeyValueList } from '@/components/data-display/ItemList';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { toUserMessage } from '@/services/errors';
import type {
  ErpObjectType,
  ErpRecord,
  IntegrationApi,
  IntegrationMode,
  IntegrationOutboxItem,
  IntegrationSyncRun,
  OutboxStatus,
  SyncRunStatus,
} from '@/services/data/types';
import { formatDateTime, formatDuration } from '@/utils/date';
import styles from './IntegrationPage.module.css';

/* Intégration ERP (préparation SAP). Tant que le vrai SAP n'est pas branché, tout ce qui s'affiche ici provient
   du Mock SAP et est présenté comme une SIMULATION. Les opérations sont exécutées par le serveur. */

const RUN_STATUS: Record<SyncRunStatus, { label: string; tone: Tone }> = {
  running: { label: 'En cours', tone: 'info' },
  success: { label: 'Réussie', tone: 'success' },
  partial: { label: 'Partielle', tone: 'warning' },
  failed: { label: 'Échec', tone: 'danger' },
};

const OUTBOX_STATUS: Record<OutboxStatus, { label: string; tone: Tone }> = {
  pending: { label: 'En attente', tone: 'neutral' },
  sending: { label: 'Envoi en cours', tone: 'info' },
  sent: { label: 'Envoyé', tone: 'success' },
  failed: { label: 'Nouvel essai prévu', tone: 'warning' },
  dead: { label: 'Abandonné', tone: 'danger' },
};

const OBJECT_LABELS: Record<ErpObjectType, string> = {
  productionOrder: 'Ordres de fabrication',
  workCenter: 'Postes de travail',
  material: 'Articles',
  stock: 'Stocks',
  stockMovement: 'Mouvements',
  qualityNotification: 'Avis qualité',
  maintenanceNotification: 'Avis maintenance',
};

const OPERATION_LABELS: Record<IntegrationOutboxItem['operation'], string> = {
  createQualityNotification: 'Avis qualité',
  createMaintenanceNotification: 'Avis maintenance',
};

const MODE_LABELS: Record<IntegrationMode, string> = {
  mock: 'Mock SAP — simulation',
  real: 'Connecteur réel',
  off: 'Désactivée',
};

/** Durée d'une synchronisation, en secondes (elles durent souvent moins d'une seconde) */
const duration = (r: IntegrationSyncRun) => {
  if (!r.finishedAt) return '—';
  const s = (new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000;
  return s < 60 ? `${s.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s` : formatDuration(s * 1000);
};

export function IntegrationPage() {
  const ds = useDataSource();
  if (!ds.integration)
    return (
      <>
        <PageHeader title="Intégration ERP" />
        <EmptyState
          title="Indisponible en mode local"
          description="L’intégration ERP est exécutée par le serveur : elle n’existe pas quand les données sont stockées dans le navigateur."
        />
      </>
    );
  return <IntegrationScreen api={ds.integration} />;
}

type Tab = 'runs' | 'outbox' | 'records';

function IntegrationScreen({ api }: { api: IntegrationApi }) {
  const client = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('runs');
  const [scenario, setScenario] = useState('success');
  const [dataVersion, setDataVersion] = useState<'1' | '2'>('1');
  const [busy, setBusy] = useState<string | null>(null);

  const status = useQuery({ queryKey: ['integration', 'status'], queryFn: () => api.status(), staleTime: 60_000 });
  const settings = useQuery({ queryKey: ['integration', 'settings'], queryFn: () => api.settings() });
  const runs = useQuery({ queryKey: ['integration', 'runs'], queryFn: () => api.runs(50) });
  const outbox = useQuery({ queryKey: ['integration', 'outbox'], queryFn: () => api.outbox(50) });
  const counts = useQuery({ queryKey: ['integration', 'counts'], queryFn: () => api.recordCounts() });

  const run = async (key: string, action: () => Promise<string | void>) => {
    setBusy(key);
    try {
      const message = await action();
      if (message) toast.success(message);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(null);
      await client.invalidateQueries({ queryKey: ['integration'] });
    }
  };

  return (
    <>
      <PageHeader
        title="Intégration ERP"
        description="Synchronisation des données de l’ERP (source de vérité : ordres de fabrication, articles, stocks, avis) et envois de l’application vers l’ERP."
      />
      <QueryBoundary queries={[status, settings]}>
        {() => {
          const mode = status.data!.mode;
          const mock = mode === 'mock';
          const last = runs.data?.[0];
          return (
            <Stack>
              {mock ? (
                <Panel accent="warning">
                  <p className={styles.notice}>
                    <strong>Mock SAP — simulation.</strong> Aucune connexion au SAP de l’entreprise. Les données et les envois ci-dessous
                    sont simulés pour préparer et tester l’intégration ; ils ne proviennent pas de SAP.
                  </p>
                </Panel>
              ) : mode === 'off' ? (
                <Panel accent="info">
                  <p className={styles.notice}>Intégration ERP désactivée sur le serveur (SAP_INTEGRATION_MODE=off).</p>
                </Panel>
              ) : (
                <Panel accent="danger">
                  <p className={styles.notice}>
                    Mode « connecteur réel » configuré sur le serveur, mais aucun connecteur SAP n’est encore implémenté : les
                    synchronisations échouent volontairement.
                  </p>
                </Panel>
              )}

              <Columns>
                <Panel title="Connecteur">
                  <KeyValueList
                    items={[
                      { label: 'Système', value: status.data!.system },
                      { label: 'Mode', value: <Badge tone={mock ? 'warning' : 'neutral'}>{MODE_LABELS[mode]}</Badge> },
                      {
                        label: 'Dernière synchronisation',
                        value: last ? (
                          <span className={styles.inline}>
                            {formatDateTime(last.startedAt)}{' '}
                            <Badge tone={RUN_STATUS[last.status].tone}>{RUN_STATUS[last.status].label}</Badge>
                          </span>
                        ) : (
                          'Jamais'
                        ),
                      },
                      { label: 'Durée', value: last ? duration(last) : '—' },
                      {
                        label: 'Envoi vers l’ERP',
                        value: settings.data!.outboundEnabled ? <Badge tone="info">Activé</Badge> : <Badge>Désactivé</Badge>,
                      },
                      { label: 'Essais maximum par envoi', value: settings.data!.maxAttempts },
                    ]}
                  />
                </Panel>
                <Panel
                  title="Synchroniser"
                  description="Lecture de l’ERP puis enregistrement : création, mise à jour, ou rien si inchangé."
                >
                  <div className={styles.form}>
                    {mock && (
                      <>
                        <SelectField
                          label="Scénario simulé"
                          options={status.data!.scenarios.map((s) => ({ value: s.id, label: s.label }))}
                          value={scenario}
                          onChange={(e) => setScenario(e.target.value)}
                        />
                        <SelectField
                          label="Jeu de données simulé"
                          options={[
                            { value: '1', label: 'Version 1 — état initial' },
                            { value: '2', label: 'Version 2 — ordres avancés, nouveaux ordres' },
                          ]}
                          value={dataVersion}
                          onChange={(e) => setDataVersion(e.target.value as '1' | '2')}
                        />
                      </>
                    )}
                    <Button
                      variant="primary"
                      icon={<RefreshCw size={16} aria-hidden />}
                      disabled={mode === 'off'}
                      loading={busy === 'sync'}
                      onClick={() =>
                        run('sync', async () => {
                          const r = await api.sync({ scenario: mock ? scenario : undefined, dataVersion: dataVersion === '2' ? 2 : 1 });
                          // Échec journalisé côté serveur : on affiche son motif (ex. « SAP indisponible »)
                          if (r.status === 'failed') {
                            toast.error(`Synchronisation en échec : ${r.errorMessage ?? 'motif inconnu'}`);
                            return;
                          }
                          return `Synchronisation ${RUN_STATUS[r.status].label.toLowerCase()} : ${r.recordsCreated} créé(s), ${r.recordsUpdated} modifié(s), ${r.recordsFailed} rejeté(s).`;
                        }).then(() => setTab('runs'))
                      }
                    >
                      Synchroniser maintenant
                    </Button>
                  </div>
                </Panel>
              </Columns>

              <Tabs<Tab>
                label="Journal d’intégration"
                value={tab}
                onChange={setTab}
                items={[
                  { value: 'runs', label: 'Synchronisations', count: runs.data?.length },
                  { value: 'outbox', label: 'Envois vers l’ERP', count: outbox.data?.filter((o) => o.status !== 'sent').length },
                  { value: 'records', label: 'Données reçues' },
                ]}
              />
              {tab === 'runs' && <RunsTable runs={runs} scenarios={status.data!.scenarios} />}
              {tab === 'outbox' && (
                <OutboxPanel
                  outbox={outbox}
                  mock={mock}
                  outboundEnabled={settings.data!.outboundEnabled}
                  scenarios={status.data!.scenarios.filter((s) => ['success', 'send_error', 'send_rejected', 'recovery'].includes(s.id))}
                  busy={busy}
                  run={run}
                  api={api}
                />
              )}
              {tab === 'records' && <RecordsPanel api={api} counts={counts.data} />}
            </Stack>
          );
        }}
      </QueryBoundary>
    </>
  );
}

function RunsTable({ runs, scenarios }: { runs: UseQueryResult<IntegrationSyncRun[]>; scenarios: { id: string; label: string }[] }) {
  const scenarioLabel = new Map(scenarios.map((s) => [s.id, s.label]));
  const columns: Column<IntegrationSyncRun>[] = [
    { id: 'at', header: 'Début', mobile: 'aside', cell: (r) => formatDateTime(r.startedAt), sortValue: (r) => r.startedAt },
    {
      id: 'status',
      header: 'Statut',
      mobile: 'title',
      cell: (r) => <Badge tone={RUN_STATUS[r.status].tone}>{RUN_STATUS[r.status].label}</Badge>,
      sortValue: (r) => r.status,
    },
    {
      id: 'source',
      header: 'Source',
      mobile: 'meta',
      cell: (r) => (r.mode === 'mock' ? `${r.source} — simulation` : r.source),
    },
    { id: 'scenario', header: 'Scénario', mobile: 'meta', cell: (r) => (r.scenario ? (scenarioLabel.get(r.scenario) ?? r.scenario) : '—') },
    { id: 'duration', header: 'Durée', mobile: 'hidden', align: 'right', cell: duration },
    { id: 'read', header: 'Lus', mobile: 'meta', align: 'right', cell: (r) => r.recordsRead },
    { id: 'created', header: 'Créés', mobile: 'meta', align: 'right', cell: (r) => r.recordsCreated },
    { id: 'updated', header: 'Modifiés', mobile: 'meta', align: 'right', cell: (r) => r.recordsUpdated },
    { id: 'unchanged', header: 'Inchangés', mobile: 'hidden', align: 'right', cell: (r) => r.recordsUnchanged },
    { id: 'failed', header: 'Rejetés', mobile: 'meta', align: 'right', cell: (r) => r.recordsFailed },
    { id: 'error', header: 'Dernier message', mobile: 'meta', cell: (r) => r.errorMessage ?? '—' },
  ];
  return (
    <QueryBoundary queries={[runs]} compact>
      {() => (
        <Panel flush>
          <DataTable
            caption="Historique des synchronisations"
            rows={runs.data ?? []}
            columns={columns}
            rowKey={(r) => r.id}
            initialSort={{ id: 'at', direction: 'desc' }}
            empty={{ title: 'Aucune synchronisation pour le moment.' }}
          />
        </Panel>
      )}
    </QueryBoundary>
  );
}

function OutboxPanel({
  outbox,
  mock,
  outboundEnabled,
  scenarios,
  busy,
  run,
  api,
}: {
  outbox: UseQueryResult<IntegrationOutboxItem[]>;
  mock: boolean;
  outboundEnabled: boolean;
  scenarios: { id: string; label: string }[];
  busy: string | null;
  run: (key: string, action: () => Promise<string | void>) => Promise<void>;
  api: IntegrationApi;
}) {
  const [scenario, setScenario] = useState('success');
  const columns: Column<IntegrationOutboxItem>[] = [
    { id: 'at', header: 'Créé', mobile: 'aside', cell: (o) => formatDateTime(o.createdAt), sortValue: (o) => o.createdAt },
    { id: 'op', header: 'Opération', mobile: 'title', cell: (o) => OPERATION_LABELS[o.operation] },
    {
      id: 'origin',
      header: 'Origine',
      mobile: 'meta',
      cell: (o) => (o.entityType === 'integrationTest' ? 'Envoi de test' : `${o.entityType} · ${o.entityId}`),
    },
    {
      id: 'status',
      header: 'Statut',
      mobile: 'meta',
      cell: (o) => <Badge tone={OUTBOX_STATUS[o.status].tone}>{OUTBOX_STATUS[o.status].label}</Badge>,
      sortValue: (o) => o.status,
    },
    { id: 'attempts', header: 'Essais', mobile: 'meta', align: 'right', cell: (o) => o.attempts },
    {
      id: 'next',
      header: 'Prochain essai',
      mobile: 'hidden',
      cell: (o) => (o.status === 'failed' || o.status === 'pending' ? formatDateTime(o.nextRetryAt) : '—'),
    },
    {
      id: 'ref',
      header: 'Référence ERP',
      mobile: 'meta',
      cell: (o) => (o.externalId ? `${o.externalId}${o.simulated ? ' (simulation)' : ''}` : '—'),
    },
    { id: 'error', header: 'Dernière erreur', mobile: 'meta', cell: (o) => o.lastError ?? '—' },
    {
      id: 'retry',
      header: '',
      align: 'right',
      mobile: 'meta',
      cell: (o) =>
        o.status === 'failed' || o.status === 'dead' ? (
          <Button
            size="sm"
            loading={busy === `retry-${o.id}`}
            onClick={() =>
              run(`retry-${o.id}`, async () => {
                await api.retryOutbox(o.id);
                return 'Envoi remis dans la file.';
              })
            }
          >
            Relancer
          </Button>
        ) : null,
    },
  ];
  return (
    <Stack gap={4}>
      <Panel
        title="File d’envoi"
        description="L’application enregistre d’abord chez elle ; l’envoi vers l’ERP se fait ensuite, avec nouveaux essais si l’ERP ne répond pas. Aucune donnée de l’application n’est placée automatiquement dans cette file pour l’instant."
      >
        <div className={styles.form}>
          <Button
            variant={outboundEnabled ? 'secondary' : 'primary'}
            loading={busy === 'configure'}
            onClick={() =>
              run('configure', async () => {
                await api.configure({ outboundEnabled: !outboundEnabled });
                return outboundEnabled ? 'Envoi vers l’ERP désactivé.' : 'Envoi vers l’ERP activé.';
              })
            }
          >
            {outboundEnabled ? 'Désactiver l’envoi' : 'Activer l’envoi'}
          </Button>
          {mock && (
            <>
              <Button
                loading={busy === 'test-quality'}
                onClick={() =>
                  run('test-quality', async () => {
                    await api.enqueueTest('quality');
                    return 'Envoi de test ajouté (avis qualité).';
                  })
                }
              >
                Envoi de test — avis qualité
              </Button>
              <Button
                loading={busy === 'test-maintenance'}
                onClick={() =>
                  run('test-maintenance', async () => {
                    await api.enqueueTest('maintenance');
                    return 'Envoi de test ajouté (avis maintenance).';
                  })
                }
              >
                Envoi de test — avis maintenance
              </Button>
              <SelectField
                label="Réponse simulée"
                options={scenarios.map((s) => ({ value: s.id, label: s.label }))}
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
              />
            </>
          )}
          <Button
            variant="primary"
            icon={<Send size={16} aria-hidden />}
            disabled={!outboundEnabled}
            loading={busy === 'process'}
            onClick={() =>
              run('process', async () => {
                const r = await api.processOutbox({ scenario: mock ? scenario : undefined });
                return `${r.processed} traité(s) : ${r.sent} envoyé(s), ${r.retried} à réessayer, ${r.dead} abandonné(s).`;
              })
            }
          >
            Traiter la file
          </Button>
        </div>
      </Panel>
      <QueryBoundary queries={[outbox]} compact>
        {() => (
          <Panel flush>
            <DataTable
              caption="Envois vers l’ERP"
              rows={outbox.data ?? []}
              columns={columns}
              rowKey={(o) => o.id}
              initialSort={{ id: 'at', direction: 'desc' }}
              empty={{ title: 'Aucun envoi.' }}
            />
          </Panel>
        )}
      </QueryBoundary>
    </Stack>
  );
}

/** Résumé lisible d'un enregistrement reçu, selon son type */
function summary(r: ErpRecord): string {
  const p = r.payload as Record<string, string | number | undefined>;
  switch (r.objectType) {
    case 'productionOrder':
      return `OF ${p.orderNumber} — ${p.description} — ${p.confirmedQuantity}/${p.plannedQuantity} ${p.unit} — ${p.status}`;
    case 'workCenter':
      return `${p.code} — ${p.name}`;
    case 'material':
      return `${p.materialNumber} — ${p.description} (${p.baseUnit})`;
    case 'stock':
      return `${p.materialNumber} @ ${p.location} : ${p.quantity} ${p.unit}`;
    case 'stockMovement':
      return `${p.movementType} — ${p.materialNumber} @ ${p.location} : ${p.quantity} ${p.unit}${p.orderNumber ? ` (OF ${p.orderNumber})` : ''}`;
    case 'qualityNotification':
    case 'maintenanceNotification':
      return `${p.number} — ${p.title} — ${p.status}`;
  }
}

function RecordsPanel({ api, counts }: { api: IntegrationApi; counts?: Record<ErpObjectType, number> }) {
  const [type, setType] = useState<ErpObjectType>('productionOrder');
  const records = useQuery({ queryKey: ['integration', 'records', type], queryFn: () => api.records(type, 200) });
  const columns: Column<ErpRecord>[] = [
    { id: 'id', header: 'Identifiant externe', mobile: 'title', cell: (r) => r.externalId, sortValue: (r) => r.externalId },
    { id: 'summary', header: 'Contenu', mobile: 'meta', cell: summary },
    {
      id: 'source',
      header: 'Mise à jour dans l’ERP',
      mobile: 'meta',
      cell: (r) => (r.sourceUpdatedAt ? formatDateTime(r.sourceUpdatedAt) : '—'),
      sortValue: (r) => r.sourceUpdatedAt ?? '',
    },
    { id: 'received', header: 'Reçu le', mobile: 'aside', cell: (r) => formatDateTime(r.updatedAt), sortValue: (r) => r.updatedAt },
    {
      id: 'origin',
      header: 'Origine',
      mobile: 'meta',
      cell: (r) => (r.simulated ? <Badge tone="warning">Simulation</Badge> : <Badge>{r.system}</Badge>),
    },
  ];
  return (
    <Stack gap={4}>
      <Tabs<ErpObjectType>
        variant="segmented"
        label="Type de données"
        value={type}
        onChange={setType}
        items={(Object.keys(OBJECT_LABELS) as ErpObjectType[]).map((t) => ({ value: t, label: OBJECT_LABELS[t], count: counts?.[t] }))}
      />
      <QueryBoundary queries={[records]} compact>
        {() => (
          <Panel flush>
            <DataTable
              caption={OBJECT_LABELS[type]}
              rows={records.data ?? []}
              columns={columns}
              rowKey={(r) => r.id}
              initialSort={{ id: 'id', direction: 'asc' }}
              search={{ placeholder: 'Rechercher…', text: (r) => `${r.externalId} ${summary(r)}` }}
              empty={{ title: 'Aucune donnée reçue. Lancez une synchronisation.' }}
            />
          </Panel>
        )}
      </QueryBoundary>
    </Stack>
  );
}

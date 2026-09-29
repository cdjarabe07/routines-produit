import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Pencil, Play, Plus } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { ItemList } from '@/components/data-display/ItemList';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { useLookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useNow } from '@/hooks/useNow';
import type { SequenceRun, SequenceTemplate } from '@/types/domain';
import { formatDateTime, formatDuration } from '@/utils/date';
import { useStartSequence } from '../api';
import { SequenceEditor } from '../components/SequenceEditor';
import { RUN_STATUS, isLive, plannedMs, totalElapsedMs } from '../model';
import styles from './SequencesPage.module.css';

export function SequencesPage() {
  const user = useCurrentUser();
  const { can } = useAuth();
  const navigate = useNavigate();
  const now = useNow(1000);
  const templates = useCollection('sequenceTemplates');
  const runs = useCollection('sequenceRuns');
  const knowledge = useCollection('knowledgeItems');
  const { queries, lookups } = useLookups();
  const start = useStartSequence();
  const [editing, setEditing] = useState<SequenceTemplate | 'new' | null>(null);

  const launch = async (template: SequenceTemplate) => {
    const run = await start.mutateAsync({ template, user });
    navigate(`/sequences/execution/${run.id}`);
  };

  return (
    <>
      <PageHeader
        title="Séquences guidées"
        description="Enchaînements d’étapes chronométrées : démarrage de poste, changement de série, journée type."
        actions={can('sequence.manage') && <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>Nouvelle séquence</Button>}
      />
      <QueryBoundary queries={[templates, runs, knowledge, ...queries]}>
        {() => {
          const byId = new Map(templates.data!.map((t) => [t.id, t]));
          const live = runs.data!.filter(isLive).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          const past = runs.data!.filter((r) => !isLive(r));
          const columns: Column<SequenceRun>[] = [
            { id: 'date', header: 'Démarrée le', mobile: 'meta', cell: (r) => <span style={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.createdAt)}</span>, sortValue: (r) => r.createdAt },
            { id: 'name', header: 'Séquence', mobile: 'title', cell: (r) => byId.get(r.templateId)?.name ?? 'Séquence supprimée' },
            { id: 'by', header: 'Par', mobile: 'meta', cell: (r) => lookups!.userName(r.startedBy) },
            {
              id: 'duration', header: 'Durée réelle / cible', mobile: 'meta', align: 'right',
              cell: (r) => {
                const t = byId.get(r.templateId);
                return `${formatDuration(totalElapsedMs(r, now))}${t ? ` / ${formatDuration(plannedMs(t))}` : ''}`;
              },
            },
            { id: 'status', header: 'Statut', mobile: 'aside', cell: (r) => <Badge tone={RUN_STATUS[r.status].tone}>{RUN_STATUS[r.status].label}</Badge> },
          ];

          return (
            <Stack>
              {live.length > 0 && (
                <Panel title="Séquences en cours" accent="info" flush>
                  <ItemList
                    items={live.map((r) => {
                      const t = byId.get(r.templateId);
                      return {
                        id: r.id,
                        title: t?.name ?? 'Séquence',
                        meta: `Étape ${r.currentStepIndex + 1}/${r.steps.length} · ${t?.steps[r.currentStepIndex]?.title ?? ''} · démarrée par ${lookups!.userName(r.startedBy)}`,
                        aside: <Badge tone={RUN_STATUS[r.status].tone}>{RUN_STATUS[r.status].label}</Badge>,
                        to: `/sequences/execution/${r.id}`,
                      };
                    })}
                  />
                </Panel>
              )}

              {templates.data!.filter((t) => t.active).length === 0 ? (
                <EmptyState title="Aucune séquence disponible." description={can('sequence.manage') ? 'Créez une première séquence.' : 'Demandez à un responsable d’en créer une.'} />
              ) : (
                <ul className={styles.grid}>
                  {templates.data!.filter((t) => t.active).map((t) => (
                    <li key={t.id} className={styles.card}>
                      <div className={styles.cardHead}>
                        <h2 className={styles.cardTitle}>{t.name}</h2>
                        {can('sequence.manage') && <IconButton size="sm" label={`Modifier ${t.name}`} icon={<Pencil size={15} />} onClick={() => setEditing(t)} />}
                      </div>
                      {t.description && <p className={styles.cardText}>{t.description}</p>}
                      <p className={styles.cardMeta}>{t.steps.length} étapes · durée cible {formatDuration(plannedMs(t))}</p>
                      <ol className={styles.stepPreview}>
                        {t.steps.slice(0, 4).map((s) => <li key={s.id}>{s.title}</li>)}
                        {t.steps.length > 4 && <li className={styles.more}>+ {t.steps.length - 4} autres étapes</li>}
                      </ol>
                      <Button variant="primary" icon={<Play size={16} aria-hidden />} loading={start.isPending && start.variables?.template.id === t.id} onClick={() => launch(t)}>
                        Démarrer
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <Panel title="Historique des exécutions" flush>
                <DataTable caption="Historique des séquences" rows={past} columns={columns} rowKey={(r) => r.id} rowLink={(r) => `/sequences/execution/${r.id}`} initialSort={{ id: 'date', direction: 'desc' }} pageSize={15} empty={{ title: 'Aucune séquence exécutée pour l’instant.' }} />
              </Panel>
            </Stack>
          );
        }}
      </QueryBoundary>
      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nouvelle séquence' : 'Modifier la séquence'} size="lg">
        {editing !== null && knowledge.data && <SequenceEditor template={editing === 'new' ? undefined : editing} knowledge={knowledge.data} onDone={() => setEditing(null)} />}
      </Drawer>
    </>
  );
}

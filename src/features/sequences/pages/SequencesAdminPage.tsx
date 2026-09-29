import { useState } from 'react';
import { Plus } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { useCollection } from '@/hooks/useData';
import type { SequenceTemplate } from '@/types/domain';
import { formatDuration } from '@/utils/date';
import { useSetSequenceActive } from '../api';
import { SequenceEditor } from '../components/SequenceEditor';
import { activeSteps, plannedMs } from '../model';

/** Administration des séquences guidées : étapes, ordre, durée, consigne, critère de validation, étapes actives. */
export function SequencesAdminPage() {
  const templates = useCollection('sequenceTemplates');
  const runs = useCollection('sequenceRuns');
  const knowledge = useCollection('knowledgeItems');
  const setActive = useSetSequenceActive();
  const [editing, setEditing] = useState<SequenceTemplate | 'new' | null>(null);

  const columns: Column<SequenceTemplate>[] = [
    { id: 'name', header: 'Séquence', mobile: 'title', cell: (t) => t.name, sortValue: (t) => t.name },
    {
      id: 'steps',
      header: 'Étapes',
      align: 'center',
      mobile: 'meta',
      cell: (t) => (activeSteps(t).length === t.steps.length ? t.steps.length : `${activeSteps(t).length} actives / ${t.steps.length}`),
    },
    {
      id: 'duration',
      header: 'Durée cible',
      align: 'center',
      mobile: 'meta',
      cell: (t) => formatDuration(plannedMs(t)),
      sortValue: (t) => plannedMs(t),
    },
    {
      id: 'runs',
      header: 'Exécutions',
      align: 'center',
      mobile: 'meta',
      cell: (t) => (runs.data ?? []).filter((r) => r.templateId === t.id).length,
    },
    {
      id: 'status',
      header: 'Statut',
      mobile: 'aside',
      cell: (t) => (t.active ? <Badge tone="success">Active</Badge> : <Badge>Archivée</Badge>),
      sortValue: (t) => (t.active ? 0 : 1),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      mobile: 'meta',
      cell: (t) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <Button size="sm" onClick={() => setEditing(t)}>
            Modifier
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setActive.mutate({ id: t.id, active: !t.active })}>
            {t.active ? 'Archiver' : 'Réactiver'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Séquences guidées"
        description="Construisez les séquences du mode guidé. Les modifications s’appliquent aux prochaines exécutions ; celles en cours gardent leurs étapes."
        actions={
          <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>
            Nouvelle séquence
          </Button>
        }
      />
      <QueryBoundary queries={[templates, runs, knowledge]}>
        {() => (
          <Panel flush>
            <DataTable
              caption="Séquences guidées"
              rows={templates.data!}
              columns={columns}
              rowKey={(t) => t.id}
              initialSort={{ id: 'status', direction: 'asc' }}
              empty={{
                title: 'Aucune séquence.',
                action: (
                  <Button variant="primary" onClick={() => setEditing('new')}>
                    Créer la première séquence
                  </Button>
                ),
              }}
            />
          </Panel>
        )}
      </QueryBoundary>
      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nouvelle séquence' : 'Modifier la séquence'}
        size="lg"
      >
        {editing !== null && knowledge.data && (
          <SequenceEditor
            key={editing === 'new' ? 'new' : editing.id}
            template={editing === 'new' ? undefined : editing}
            knowledge={knowledge.data}
            onDone={() => setEditing(null)}
          />
        )}
      </Drawer>
    </>
  );
}

import { useState } from 'react';
import { Link } from 'react-router';
import { CalendarPlus, Copy, Plus } from 'lucide-react';
import { Can } from '@/app/providers/AuthProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { useLookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import type { RoutineTemplate } from '@/types/domain';
import { createId } from '@/utils/id';
import { useSetTemplateActive } from '../api';
import { TemplateEditor } from '../components/TemplateEditor';

/** Administration des routines : contenu (tâches, contrôles), zone, poste, durée. La planification est un écran distinct. */
export function RoutineTemplatesPage() {
  const templates = useCollection('routineTemplates');
  const schedules = useCollection('schedules');
  const knowledge = useCollection('knowledgeItems');
  const checklists = useCollection('checklists');
  const { queries, lookups } = useLookups();
  const setActive = useSetTemplateActive();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<RoutineTemplate | 'new' | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<RoutineTemplate | null>(null);

  const activeSchedules = (id: string) => (schedules.data ?? []).filter((s) => s.routineId === id && s.status === 'active').length;

  const columns: Column<RoutineTemplate>[] = [
    { id: 'title', header: 'Routine', cell: (t) => t.title, sortValue: (t) => t.title, mobile: 'title' },
    {
      id: 'zone',
      header: 'Zone / poste',
      mobile: 'meta',
      cell: (t) =>
        [t.lineId ? lookups?.lineName(t.lineId) : null, t.workstationId ? lookups?.workstationById.get(t.workstationId)?.code : null]
          .filter(Boolean)
          .join(' · ') || '—',
    },
    { id: 'tasks', header: 'Tâches', align: 'center', cell: (t) => t.tasks.length, sortValue: (t) => t.tasks.length, mobile: 'meta' },
    {
      id: 'duration',
      header: 'Durée',
      align: 'center',
      cell: (t) => `${t.durationMin} min`,
      sortValue: (t) => t.durationMin,
      mobile: 'meta',
    },
    {
      id: 'schedules',
      header: 'Planifications',
      align: 'center',
      mobile: 'meta',
      cell: (t) => {
        const n = activeSchedules(t.id);
        return n ? <Link to={`/admin/planification?routine=${t.id}`}>{n} active(s)</Link> : <span>Non planifiée</span>;
      },
      sortValue: (t) => activeSchedules(t.id),
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
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
          <Button size="sm" onClick={() => setEditing(t)}>
            Modifier
          </Button>
          {t.active && (
            <Can permission="schedule.manage">
              <ButtonLink size="sm" to={`/admin/planification?nouvelle=${t.id}`} icon={<CalendarPlus size={15} aria-hidden />}>
                Planifier
              </ButtonLink>
            </Can>
          )}
          <IconButton label={`Dupliquer ${t.title}`} size="sm" icon={<Copy size={15} />} onClick={() => setDuplicateOf(t)} />
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (
                t.active &&
                !(await confirm({
                  title: 'Archiver cette routine ?',
                  message: `Ses ${activeSchedules(t.id)} planification(s) active(s) s’arrêteront aujourd’hui. L’historique des exécutions est conservé.`,
                  confirmLabel: 'Archiver',
                }))
              )
                return;
              setActive.mutate({ id: t.id, active: !t.active });
            }}
          >
            {t.active ? 'Archiver' : 'Réactiver'}
          </Button>
        </div>
      ),
    },
  ];

  const copy = (t: RoutineTemplate): RoutineTemplate => ({
    ...structuredClone(t),
    id: '',
    title: `${t.title} (copie)`,
    tasks: t.tasks.map((task) => ({
      ...structuredClone(task),
      id: createId(),
      checks: task.checks.map((c) => ({ ...c, id: createId() })),
    })),
  });

  return (
    <>
      <PageHeader
        title="Routines"
        description="Ce qui doit être fait : tâches, contrôles, durée, zone. Quand et par qui : écran Planification."
        actions={
          <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>
            Nouvelle routine
          </Button>
        }
      />
      <QueryBoundary queries={[templates, schedules, knowledge, checklists, ...queries]}>
        {() => (
          <Panel flush>
            <DataTable
              caption="Routines"
              rows={templates.data!}
              columns={columns}
              rowKey={(t) => t.id}
              initialSort={{ id: 'status', direction: 'asc' }}
              search={{ placeholder: 'Rechercher une routine', text: (t) => `${t.title} ${t.tasks.map((x) => x.title).join(' ')}` }}
              empty={{
                title: 'Aucune routine.',
                action: (
                  <Button variant="primary" onClick={() => setEditing('new')}>
                    Créer la première routine
                  </Button>
                ),
              }}
            />
          </Panel>
        )}
      </QueryBoundary>
      <Drawer
        open={editing !== null || duplicateOf !== null}
        onClose={() => {
          setEditing(null);
          setDuplicateOf(null);
        }}
        title={duplicateOf ? 'Dupliquer la routine' : editing === 'new' ? 'Nouvelle routine' : 'Modifier la routine'}
        size="lg"
      >
        {(editing !== null || duplicateOf) && knowledge.data && checklists.data && lookups && (
          <TemplateEditor
            key={duplicateOf ? `dup-${duplicateOf.id}` : editing === 'new' ? 'new' : (editing as RoutineTemplate).id}
            template={duplicateOf ? { ...copy(duplicateOf) } : editing === 'new' ? undefined : (editing as RoutineTemplate)}
            isCopy={Boolean(duplicateOf)}
            knowledge={knowledge.data}
            checklists={checklists.data}
            lookups={lookups}
            onDone={() => {
              setEditing(null);
              setDuplicateOf(null);
            }}
          />
        )}
      </Drawer>
    </>
  );
}

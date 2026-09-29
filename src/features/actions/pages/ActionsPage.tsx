import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus } from 'lucide-react';
import { Can, useCurrentUser } from '@/app/providers/AuthProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/Field';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { ACTION_SOURCE, PRIORITY, options } from '@/features/shared/labels';
import { useLookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import type { Action, Priority } from '@/types/domain';
import { todayKey } from '@/utils/date';
import { ActionForm } from '../components/ActionForm';
import { ActionStatusBadge, DueDate, PriorityBadge } from '../components/ActionBadges';
import { filterActions, isOverdue, sortActions, type ActionView } from '../model';

const VIEWS: { value: ActionView; label: string }[] = [
  { value: 'mine', label: 'Mes actions' },
  { value: 'all', label: 'Toutes les actions ouvertes' },
  { value: 'overdue', label: 'En retard' },
  { value: 'closed', label: 'Terminées / annulées' },
];

export function ActionsPage() {
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const view = (params.get('vue') as ActionView | null) ?? 'mine';
  const [priority, setPriority] = useState<Priority | ''>('');
  const [creating, setCreating] = useState(false);
  const actions = useCollection('actions');
  const { queries, lookups } = useLookups();
  const today = todayKey();

  const counts = useMemo(() => {
    const list = actions.data ?? [];
    return Object.fromEntries(VIEWS.map((v) => [v.value, filterActions(list, v.value, user.id, today).length])) as Record<
      ActionView,
      number
    >;
  }, [actions.data, user.id, today]);

  const rows = useMemo(() => {
    const filtered = filterActions(actions.data ?? [], view, user.id, today).filter((a) => !priority || a.priority === priority);
    return view === 'closed'
      ? filtered.sort((a, b) => (b.closedAt ?? b.updatedAt).localeCompare(a.closedAt ?? a.updatedAt))
      : sortActions(filtered, today);
  }, [actions.data, view, user.id, today, priority]);

  const columns: Column<Action>[] = [
    { id: 'title', header: 'Action', mobile: 'title', cell: (a) => a.title, sortValue: (a) => a.title },
    {
      id: 'source',
      header: 'Origine',
      mobile: 'meta',
      cell: (a) => <Badge>{ACTION_SOURCE[a.source.type]}</Badge>,
      sortValue: (a) => ACTION_SOURCE[a.source.type],
    },
    {
      id: 'assignee',
      header: 'Responsable',
      mobile: 'meta',
      cell: (a) => lookups?.userName(a.assigneeId),
      sortValue: (a) => lookups?.userName(a.assigneeId) ?? '',
    },
    {
      id: 'priority',
      header: 'Priorité',
      mobile: 'meta',
      cell: (a) => <PriorityBadge action={a} />,
      sortValue: (a) => PRIORITY[a.priority].rank,
    },
    { id: 'due', header: 'Échéance', mobile: 'meta', cell: (a) => <DueDate action={a} today={today} />, sortValue: (a) => a.dueDate },
    {
      id: 'status',
      header: 'Statut',
      mobile: 'aside',
      cell: (a) => <ActionStatusBadge action={a} today={today} />,
      sortValue: (a) => a.status,
    },
  ];

  return (
    <>
      <PageHeader
        title="Actions"
        description="Registre unique des actions de l’atelier : décidées en réunion, issues d’anomalies, de Gemba Walk ou saisies directement."
        actions={
          <Can permission="action.create">
            <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setCreating(true)}>
              Nouvelle action
            </Button>
          </Can>
        }
      />
      <QueryBoundary queries={[actions, ...queries]}>
        {() => (
          <Panel flush>
            <div style={{ padding: '0 var(--space-4)' }}>
              <Tabs
                label="Vue des actions"
                value={view}
                onChange={(v) => setParams(v === 'mine' ? {} : { vue: v }, { replace: true })}
                items={VIEWS.map((v) => ({ ...v, count: counts[v.value] }))}
              />
            </div>
            <DataTable
              caption={VIEWS.find((v) => v.value === view)!.label}
              rows={rows}
              columns={columns}
              rowKey={(a) => a.id}
              rowLink={(a) => `/actions/${a.id}`}
              rowTone={(a) => (isOverdue(a, today) ? 'danger' : undefined)}
              search={{
                placeholder: 'Rechercher une action, un responsable…',
                text: (a) => `${a.title} ${a.description ?? ''} ${lookups?.userName(a.assigneeId)}`,
              }}
              toolbar={
                <div style={{ minWidth: 180 }}>
                  <SelectField
                    label="Priorité"
                    hideLabel
                    placeholder="Toutes priorités"
                    options={options(PRIORITY)}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority | '')}
                  />
                </div>
              }
              empty={{
                title:
                  view === 'mine'
                    ? 'Aucune action ouverte à votre nom.'
                    : view === 'overdue'
                      ? 'Aucune action en retard.'
                      : 'Aucune action dans cette vue.',
              }}
            />
          </Panel>
        )}
      </QueryBoundary>

      <Drawer open={creating} onClose={() => setCreating(false)} title="Nouvelle action" size="md">
        {creating && lookups && <ActionForm users={lookups.users} onDone={() => setCreating(false)} />}
      </Drawer>
    </>
  );
}

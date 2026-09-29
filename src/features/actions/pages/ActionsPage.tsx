import { useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
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

/* Supervision : toutes les actions de l'atelier. Mon travail : uniquement celles qui me sont confiées. */
const SUPERVISION_VIEWS: { value: ActionView; label: string }[] = [
  { value: 'all', label: 'Ouvertes' },
  { value: 'overdue', label: 'En retard' },
  { value: 'blocked', label: 'Bloquées' },
  { value: 'mine', label: 'Mes actions' },
  { value: 'closed', label: 'Terminées / annulées' },
];
const PERSONAL_VIEWS: { value: ActionView; label: string }[] = [
  { value: 'mine', label: 'À traiter' },
  { value: 'mineClosed', label: 'Terminées' },
];

export function ActionsPage() {
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const supervision = useLocation().pathname.startsWith('/manager');
  const VIEWS = supervision ? SUPERVISION_VIEWS : PERSONAL_VIEWS;
  const defaultView: ActionView = supervision ? 'all' : 'mine';
  const requested = params.get('vue') as ActionView | null;
  const view = requested && VIEWS.some((v) => v.value === requested) ? requested : defaultView;
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
  }, [actions.data, user.id, today, VIEWS]);

  const rows = useMemo(() => {
    const filtered = filterActions(actions.data ?? [], view, user.id, today).filter((a) => !priority || a.priority === priority);
    return view === 'closed' || view === 'mineClosed'
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
        title={supervision ? 'Actions correctives' : 'Mes actions'}
        description={
          supervision
            ? 'Registre unique des actions de l’atelier : issues d’anomalies, d’Andon, de réunions, de Gemba Walk ou saisies directement.'
            : 'Les actions dont vous êtes responsable ou suppléant.'
        }
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
                onChange={(v) => setParams(v === defaultView ? {} : { vue: v }, { replace: true })}
                items={VIEWS.map((v) => ({ ...v, count: counts[v.value] }))}
              />
            </div>
            <DataTable
              caption={VIEWS.find((v) => v.value === view)!.label}
              rows={rows}
              columns={columns}
              rowKey={(a) => a.id}
              rowLink={(a) => `/actions/${a.id}`}
              rowTone={(a) => (isOverdue(a, today) || a.status === 'blocked' ? 'danger' : undefined)}
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

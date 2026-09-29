import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Can } from '@/app/providers/AuthProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Kpi, KpiStrip } from '@/components/ui/Kpi';
import { Panel } from '@/components/ui/Panel';
import { isOpenAction } from '@/features/actions/model';
import { useLookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import type { GembaWalk } from '@/types/domain';
import { addDays, formatDate, todayKey } from '@/utils/date';
import { GEMBA_STATUS, koItems } from '../model';

export function GembaListPage() {
  const navigate = useNavigate();
  const walks = useCollection('gembaWalks');
  const actions = useCollection('actions');
  const { queries, lookups } = useLookups();

  return (
    <>
      <PageHeader
        title="Gemba Walk"
        description="Marches terrain : observations, écarts à la checklist et actions d’amélioration."
        actions={<Can permission="gemba.conduct"><Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => navigate('/gemba/nouvelle')}>Nouvelle Gemba Walk</Button></Can>}
      />
      <QueryBoundary queries={[walks, actions, ...queries]}>
        {() => {
          const since = addDays(todayKey(), -29);
          const recent = walks.data!.filter((w) => w.date >= since && w.status !== 'draft');
          const gembaActions = actions.data!.filter((a) => a.source.type === 'gemba');
          const openActions = gembaActions.filter(isOpenAction).length;
          const actionsOf = (w: GembaWalk) => gembaActions.filter((a) => a.source.id === w.id);
          const columns: Column<GembaWalk>[] = [
            { id: 'date', header: 'Date', mobile: 'meta', cell: (w) => formatDate(w.date), sortValue: (w) => w.date },
            { id: 'zone', header: 'Zone', mobile: 'title', cell: (w) => w.zone || 'Zone non renseignée', sortValue: (w) => w.zone },
            { id: 'leader', header: 'Conduite par', mobile: 'meta', cell: (w) => lookups!.userName(w.leaderId) },
            { id: 'ko', header: 'Non conformes', align: 'center', mobile: 'meta', cell: (w) => (koItems(w).length ? <Badge tone="danger">{koItems(w).length}</Badge> : '0'), sortValue: (w) => koItems(w).length },
            { id: 'obs', header: 'Observations', align: 'center', mobile: 'meta', cell: (w) => w.observations.length, sortValue: (w) => w.observations.length },
            { id: 'actions', header: 'Actions ouvertes', align: 'center', mobile: 'meta', cell: (w) => actionsOf(w).filter(isOpenAction).length, sortValue: (w) => actionsOf(w).filter(isOpenAction).length },
            { id: 'status', header: 'Statut', mobile: 'aside', cell: (w) => <Badge tone={GEMBA_STATUS[w.status].tone}>{GEMBA_STATUS[w.status].label}</Badge>, sortValue: (w) => w.status },
          ];
          return (
            <Stack>
              <KpiStrip>
                <Kpi label="Marches (30 jours)" value={recent.length} />
                <Kpi label="Observations (30 jours)" value={recent.reduce((s, w) => s + w.observations.length, 0)} />
                <Kpi label="Actions Gemba ouvertes" value={openActions} tone={openActions ? 'warning' : 'neutral'} to="/actions?vue=all" />
                <Kpi label="Brouillons" value={walks.data!.filter((w) => w.status === 'draft').length} />
              </KpiStrip>
              <Panel flush>
                <DataTable
                  caption="Gemba Walk"
                  rows={walks.data!}
                  columns={columns}
                  rowKey={(w) => w.id}
                  rowLink={(w) => (w.status === 'draft' ? `/gemba/nouvelle?brouillon=${w.id}` : `/gemba/${w.id}`)}
                  initialSort={{ id: 'date', direction: 'desc' }}
                  search={{ placeholder: 'Rechercher une zone, une observation…', text: (w) => `${w.zone} ${w.observations.map((o) => `${o.finding} ${o.improvement}`).join(' ')}` }}
                  empty={{ title: 'Aucune Gemba Walk enregistrée.' }}
                />
              </Panel>
            </Stack>
          );
        }}
      </QueryBoundary>
    </>
  );
}

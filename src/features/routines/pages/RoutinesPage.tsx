import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Settings2 } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Kpi, KpiStrip } from '@/components/ui/Kpi';
import { Panel } from '@/components/ui/Panel';
import { Progress } from '@/components/ui/Progress';
import { Tabs } from '@/components/ui/Tabs';
import { useLookups, useSettings } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useNow } from '@/hooks/useNow';
import { ROLE_LABELS } from '@/services/auth/permissions';
import type { RoutineRun, RoutineTemplate } from '@/types/domain';
import { formatTime, todayKey } from '@/utils/date';
import { formatPercent, ratio } from '@/utils/format';
import { DateNavigator } from '../components/DateNavigator';
import { ROUTINE_STATE, findRun, routineState, runProgress, templatesForRole, type RoutineState } from '../model';

interface Row {
  template: RoutineTemplate;
  run?: RoutineRun;
  state: RoutineState;
  treated: number;
  total: number;
  ko: number;
}

export function RoutinesPage() {
  const user = useCurrentUser();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const today = todayKey();
  const date = params.get('date') ?? today;
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const now = useNow(60_000);
  const { settings } = useSettings();
  const templates = useCollection('routineTemplates');
  const runs = useCollection('routineRuns');
  const { queries, lookups } = useLookups();

  const rows = useMemo<Row[]>(() => {
    const list = scope === 'mine' ? templatesForRole(templates.data ?? [], user.role) : (templates.data ?? []).filter((t) => t.active);
    return list
      .map((template) => {
        const run = findRun(runs.data ?? [], template.id, date);
        const p = runProgress(template, run);
        return {
          template,
          run,
          state: routineState(template, run, date, today, now, settings.routineLateToleranceMinutes),
          treated: p.treated,
          total: p.total,
          ko: p.ko,
        };
      })
      .sort((a, b) => a.template.scheduledTime.localeCompare(b.template.scheduledTime));
  }, [templates.data, runs.data, scope, user.role, date, today, now, settings.routineLateToleranceMinutes]);

  const totals = rows.reduce((acc, r) => ({ treated: acc.treated + r.treated, total: acc.total + r.total, ko: acc.ko + r.ko }), { treated: 0, total: 0, ko: 0 });
  const done = rows.filter((r) => r.state === 'done').length;
  const late = rows.filter((r) => r.state === 'late').length;

  const columns: Column<Row>[] = [
    { id: 'time', header: 'Heure', width: '80px', cell: (r) => <strong>{r.template.scheduledTime}</strong>, sortValue: (r) => r.template.scheduledTime, mobile: 'meta' },
    { id: 'title', header: 'Routine', cell: (r) => r.template.title, sortValue: (r) => r.template.title, mobile: 'title' },
    ...(scope === 'all'
      ? [{ id: 'role', header: 'Rôle', cell: (r: Row) => ROLE_LABELS[r.template.role], sortValue: (r: Row) => r.template.role, mobile: 'meta' as const }]
      : []),
    {
      id: 'progress', header: 'Avancement', width: '200px', mobile: 'meta',
      cell: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 60 }}>
            <Progress value={r.treated} max={r.total} label={`Avancement ${r.template.title}`} tone={r.state === 'done' ? 'success' : 'info'} size="sm" />
          </div>
          <span style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>{r.treated}/{r.total}</span>
        </div>
      ),
      sortValue: (r) => (r.total ? r.treated / r.total : 0),
    },
    { id: 'ko', header: 'Non conf.', align: 'center', width: '90px', mobile: 'meta', cell: (r) => (r.ko > 0 ? <Badge tone="danger">{r.ko}</Badge> : '—'), sortValue: (r) => r.ko },
    {
      id: 'last', header: 'Dernière saisie', mobile: 'hidden',
      cell: (r) => {
        const last = r.run ? Object.values(r.run.results).sort((a, b) => b.at.localeCompare(a.at))[0] : undefined;
        return last ? `${lookups?.userName(last.by)} · ${formatTime(last.at)}` : '—';
      },
    },
    { id: 'state', header: 'État', mobile: 'aside', cell: (r) => <Badge tone={ROUTINE_STATE[r.state].tone}>{ROUTINE_STATE[r.state].label}</Badge>, sortValue: (r) => r.state },
  ];

  return (
    <>
      <PageHeader
        title="Mes routines"
        description="Checklists de la journée. Chaque point validé est horodaté ; l’historique des jours précédents reste consultable."
        actions={
          can('routine.manage') && (
            <ButtonLink to="/routines/modeles" icon={<Settings2 size={16} aria-hidden />}>Gérer les modèles</ButtonLink>
          )
        }
      />
      <Stack>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <DateNavigator
            value={date}
            onChange={(d) => setParams(d === today ? {} : { date: d }, { replace: true })}
          />
          <Tabs
            variant="segmented"
            label="Périmètre"
            value={scope}
            onChange={setScope}
            items={[
              { value: 'mine', label: `Mon rôle (${ROLE_LABELS[user.role]})` },
              { value: 'all', label: 'Tous les rôles' },
            ]}
          />
        </div>

        <QueryBoundary queries={[templates, runs, ...queries]}>
          {() => (
            <>
              <KpiStrip>
                <Kpi label="Points traités" value={formatPercent(ratio(totals.treated, totals.total))} detail={`${totals.treated} sur ${totals.total}`} />
                <Kpi label="Routines terminées" value={`${done}/${rows.length}`} tone={rows.length > 0 && done === rows.length ? 'success' : 'neutral'} />
                <Kpi label="En retard" value={late} tone={late > 0 ? 'danger' : 'neutral'} detail={`Tolérance : ${settings.routineLateToleranceMinutes} min après l’heure prévue`} />
                <Kpi label="Non-conformités" value={totals.ko} tone={totals.ko > 0 ? 'warning' : 'neutral'} />
              </KpiStrip>
              <Panel flush>
                <DataTable
                  caption={`Routines du ${date}`}
                  rows={rows}
                  columns={columns}
                  rowKey={(r) => r.template.id}
                  rowLink={(r) => `/routines/${r.template.id}/${date}`}
                  rowTone={(r) => (r.state === 'late' ? 'danger' : r.state === 'due' ? 'warning' : undefined)}
                  initialSort={{ id: 'time', direction: 'asc' }}
                  empty={{
                    title: scope === 'mine' ? `Aucune routine prévue pour le rôle ${ROLE_LABELS[user.role]}.` : 'Aucune routine active.',
                    description: can('routine.manage') ? 'Créez un modèle de routine pour la planifier chaque jour.' : undefined,
                  }}
                />
              </Panel>
            </>
          )}
        </QueryBoundary>
      </Stack>
    </>
  );
}

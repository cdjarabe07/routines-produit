import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { DateNavigator } from '@/components/ui/DateNavigator';
import { SelectField } from '@/components/ui/Field';
import { Kpi, KpiStrip } from '@/components/ui/Kpi';
import { Panel } from '@/components/ui/Panel';
import { Progress } from '@/components/ui/Progress';
import { Tabs } from '@/components/ui/Tabs';
import { usePlanningData } from '@/features/planning/api';
import {
  OCCURRENCE_STATE,
  assignmentLabel,
  countOccurrences,
  occurrenceState,
  occurrencesBetween,
  type Occurrence,
  type OccurrenceState,
} from '@/features/planning/model';
import { lineOptions, teamOptions, useLookups, useSettings } from '@/features/shared/api';
import { useNow } from '@/hooks/useNow';
import { formatTime, todayKey } from '@/utils/date';
import { formatPercent, ratio } from '@/utils/format';
import { runSummary } from '../model';
import styles from './RoutineMonitorPage.module.css';

type View = 'all' | 'late' | 'in_progress' | 'done';
interface Row extends Occurrence {
  state: OccurrenceState;
  tasksDone: number;
  tasks: number;
  durationMin: number | null;
}

/** Suivi des routines de toutes les personnes : réalisation, retards, durée réelle. */
export function RoutineMonitorPage() {
  const today = todayKey();
  const now = useNow(60_000);
  const { settings } = useSettings();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? today;
  const view = (
    ['late', 'in_progress', 'done'].includes(params.get('vue') ?? '') ? params.get('vue') : params.get('vue') === 'retard' ? 'late' : 'all'
  ) as View;
  const teamId = params.get('equipe') ?? '';
  const lineId = params.get('ligne') ?? '';
  const planning = usePlanningData();
  const { queries, lookups } = useLookups();

  const setParam = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  const rows = useMemo<Row[]>(() => {
    if (!planning.source || !lookups) return [];
    const members = teamId ? new Set(lookups.teamMembers(teamId).map((u) => u.id)) : null;
    return occurrencesBetween(planning.source, date, date)
      .filter((o) => !lineId || (o.schedule.lineId ?? o.routine.lineId) === lineId)
      .filter((o) => !members || o.schedule.teamId === teamId || (o.schedule.assigneeId && members.has(o.schedule.assigneeId)))
      .map((o) => {
        const s = runSummary(o.routine, planning.checklistById, o.run);
        return {
          ...o,
          state: occurrenceState(o, today, now, settings.routineLateToleranceMinutes),
          tasksDone: s.tasksDone,
          tasks: s.tasks,
          durationMin: s.durationMin,
        };
      });
  }, [planning.source, planning.checklistById, lookups, date, lineId, teamId, today, now, settings.routineLateToleranceMinutes]);

  const counts = countOccurrences(rows, today, now, settings.routineLateToleranceMinutes);
  const visible = rows.filter((r) =>
    view === 'all'
      ? true
      : view === 'late'
        ? r.state === 'late' || r.state === 'missed'
        : view === 'in_progress'
          ? r.state === 'in_progress'
          : r.state === 'done',
  );

  const columns: Column<Row>[] = [
    { id: 'time', header: 'Heure', width: '70px', mobile: 'meta', cell: (r) => <strong>{r.time}</strong>, sortValue: (r) => r.time },
    { id: 'routine', header: 'Routine', mobile: 'title', cell: (r) => r.routine.title, sortValue: (r) => r.routine.title },
    {
      id: 'assigned',
      header: 'Affectée à',
      mobile: 'meta',
      cell: (r) => assignmentLabel(r.schedule, lookups!.userName, lookups!.teamName),
    },
    { id: 'by', header: 'Exécutée par', mobile: 'meta', cell: (r) => (r.run ? lookups!.userName(r.run.assigneeId) : '—') },
    {
      id: 'progress',
      header: 'Avancement',
      width: '170px',
      mobile: 'meta',
      cell: (r) => (
        <div className={styles.progress}>
          <Progress
            value={r.tasksDone}
            max={r.tasks}
            size="sm"
            tone={r.state === 'done' ? 'success' : 'info'}
            label={`Avancement ${r.routine.title}`}
          />
          <span>
            {r.tasksDone}/{r.tasks}
          </span>
        </div>
      ),
      sortValue: (r) => (r.tasks ? r.tasksDone / r.tasks : 0),
    },
    {
      id: 'duration',
      header: 'Durée réelle',
      align: 'center',
      mobile: 'meta',
      cell: (r) =>
        r.durationMin !== null
          ? `${r.durationMin} min${r.durationMin > r.routine.durationMin ? ` (prévu ${r.routine.durationMin})` : ''}`
          : r.run
            ? `démarrée ${formatTime(r.run.startedAt)}`
            : '—',
      sortValue: (r) => r.durationMin ?? -1,
    },
    {
      id: 'state',
      header: 'État',
      mobile: 'aside',
      cell: (r) => <Badge tone={OCCURRENCE_STATE[r.state].tone}>{OCCURRENCE_STATE[r.state].label}</Badge>,
      sortValue: (r) => r.state,
    },
  ];

  return (
    <>
      <PageHeader
        title="Suivi des routines"
        description="Routines planifiées pour toutes les personnes et équipes : qui a fait quoi, ce qui est en retard, combien de temps cela a pris."
      />
      <Stack>
        <div className={styles.toolbar}>
          <DateNavigator value={date} onChange={(d) => setParam({ date: d === today ? null : d })} allowFuture />
          <div className={styles.filters}>
            {lookups && (
              <>
                <SelectField
                  label="Équipe"
                  placeholder="Toutes"
                  options={teamOptions(lookups.teams)}
                  value={teamId}
                  onChange={(e) => setParam({ equipe: e.target.value || null })}
                />
                <SelectField
                  label="Zone"
                  placeholder="Toutes"
                  options={lineOptions(lookups.lines)}
                  value={lineId}
                  onChange={(e) => setParam({ ligne: e.target.value || null })}
                />
              </>
            )}
          </div>
        </div>
        <QueryBoundary queries={[...planning.queries, ...queries]}>
          {() => (
            <>
              <KpiStrip>
                <Kpi label="Programmées" value={counts.planned} detail={`${counts.upcoming + counts.due} à venir ou à faire`} />
                <Kpi
                  label="Terminées"
                  value={counts.done}
                  tone={counts.planned > 0 && counts.done === counts.planned ? 'success' : 'neutral'}
                  detail={formatPercent(ratio(counts.done, counts.planned))}
                />
                <Kpi label="En cours" value={counts.inProgress} />
                <Kpi
                  label="En retard"
                  value={counts.late + counts.missed}
                  tone={counts.late + counts.missed ? 'danger' : 'neutral'}
                  detail={`Tolérance ${settings.routineLateToleranceMinutes} min`}
                />
              </KpiStrip>
              <Tabs
                label="État"
                value={view}
                onChange={(v) => setParam({ vue: v === 'all' ? null : v === 'late' ? 'retard' : v })}
                items={[
                  { value: 'all', label: 'Toutes', count: rows.length },
                  { value: 'late', label: 'En retard', count: counts.late + counts.missed },
                  { value: 'in_progress', label: 'En cours', count: counts.inProgress },
                  { value: 'done', label: 'Terminées', count: counts.done },
                ]}
              />
              <Panel flush>
                <DataTable
                  caption="Routines planifiées"
                  rows={visible}
                  columns={columns}
                  rowKey={(r) => r.key}
                  rowLink={(r) => `/app/routines/${r.schedule.id}/${r.date}`}
                  rowTone={(r) => (r.state === 'late' || r.state === 'missed' ? 'danger' : r.state === 'due' ? 'warning' : undefined)}
                  initialSort={{ id: 'time', direction: 'asc' }}
                  search={{
                    placeholder: 'Rechercher une routine ou une personne',
                    text: (r) => `${r.routine.title} ${assignmentLabel(r.schedule, lookups!.userName, lookups!.teamName)}`,
                  }}
                  empty={{ title: view === 'all' ? 'Aucune routine planifiée ce jour-là.' : 'Aucune routine dans cet état.' }}
                />
              </Panel>
            </>
          )}
        </QueryBoundary>
      </Stack>
    </>
  );
}

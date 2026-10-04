import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { SelectField } from '@/components/ui/Field';
import { Drawer } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { useLookups, useSettings } from '@/features/shared/api';
import { useNow } from '@/hooks/useNow';
import type { Schedule } from '@/types/domain';
import { addDays, enumerateDays, formatDate, formatLongDate, startOfWeek, todayKey } from '@/utils/date';
import { cx } from '@/utils/cx';
import { useCancelSchedule, usePlanningData, useRestoreSchedule, useSkipOccurrence } from './api';
import { ScheduleForm } from './components/ScheduleForm';
import { TriggerButton } from './components/TriggerButton';
import {
  OCCURRENCE_STATE,
  assignmentLabel,
  describeRecurrence,
  nextDates,
  occurrenceState,
  occurrencesBetween,
  occurrencePath,
} from './model';
import styles from './SchedulesPage.module.css';

/** Planification : quelle routine, quand, par qui. Vue liste des planifications et vue semaine des occurrences. */
export function SchedulesPage() {
  const today = todayKey();
  const now = useNow(60_000);
  const { settings } = useSettings();
  const [params, setParams] = useSearchParams();
  const view = params.get('vue') === 'semaine' ? 'week' : 'list';
  const status = params.get('statut') === 'annulees' ? 'cancelled' : 'active';
  const routineFilter = params.get('routine') ?? '';
  const weekStart = startOfWeek(params.get('semaine') ?? today);
  const editingId = params.get('modifier');
  const newFor = params.get('nouvelle');
  // Exécutions : seulement la semaine affichée (la vue liste n'en utilise pas)
  const planning = usePlanningData({ from: weekStart, to: addDays(weekStart, 6) });
  const { queries, lookups } = useLookups();
  const cancel = useCancelSchedule();
  const restore = useRestoreSchedule();
  const skip = useSkipOccurrence();
  const confirm = useConfirm();

  const setParam = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  const routines = planning.source?.routines ?? [];
  const routineById = useMemo(() => new Map(routines.map((r) => [r.id, r])), [routines]);
  const schedules = (planning.source?.schedules ?? []).filter(
    (s) => s.status === status && (!routineFilter || s.routineId === routineFilter),
  );

  const columns: Column<Schedule>[] = [
    {
      id: 'routine',
      header: 'Routine',
      mobile: 'title',
      cell: (s) => routineById.get(s.routineId)?.title ?? 'Routine supprimée',
      sortValue: (s) => routineById.get(s.routineId)?.title ?? '',
    },
    {
      id: 'when',
      header: 'Quand',
      mobile: 'meta',
      cell: (s) => (s.recurrence === 'on_demand' || s.everyHours ? describeRecurrence(s) : `${describeRecurrence(s)} à ${s.time}`),
      sortValue: (s) => s.time,
    },
    {
      id: 'who',
      header: 'Affectée à',
      mobile: 'meta',
      cell: (s) => (lookups ? assignmentLabel(s, lookups.userName, lookups.teamName) : ''),
      sortValue: (s) => s.assigneeId ?? s.teamId ?? '',
    },
    {
      id: 'where',
      header: 'Zone / poste',
      mobile: 'meta',
      cell: (s) =>
        [s.lineId ? lookups?.lineName(s.lineId) : null, s.workstationId ? lookups?.workstationById.get(s.workstationId)?.code : null]
          .filter(Boolean)
          .join(' · ') || '—',
    },
    {
      id: 'period',
      header: 'Période',
      mobile: 'meta',
      cell: (s) =>
        s.recurrence === 'once'
          ? formatDate(s.startDate)
          : `Du ${formatDate(s.startDate)}${s.endDate ? ` au ${formatDate(s.endDate)}` : ''}`,
      sortValue: (s) => s.startDate,
    },
    {
      id: 'next',
      header: 'Prochaine',
      mobile: 'aside',
      cell: (s) => {
        if (s.recurrence === 'on_demand') return <Badge>Sur événement</Badge>;
        const next = nextDates(s, today, 1)[0];
        return next ? next === today ? <Badge tone="info">Aujourd’hui</Badge> : formatDate(next) : <Badge>Terminée</Badge>;
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      mobile: 'meta',
      cell: (s) =>
        s.status === 'active' ? (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            {s.recurrence === 'on_demand' && <TriggerButton schedule={s} title={routineById.get(s.routineId)?.title ?? 'la routine'} />}
            <Button size="sm" onClick={() => setParam({ modifier: s.id })}>
              Modifier
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Annuler cette planification ?',
                    message: 'Les occurrences à venir disparaissent du planning des personnes affectées. L’historique est conservé.',
                    confirmLabel: 'Annuler la planification',
                  })
                )
                  cancel.mutate({ id: s.id });
              }}
            >
              Annuler
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => restore.mutate({ id: s.id })}>
            Réactiver
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Planification"
        description="Programmez les routines : date, heure, répétition, personne ou équipe. Les occurrences apparaissent aussitôt dans le planning des personnes concernées."
        actions={
          <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setParam({ nouvelle: routineFilter || 'vide' })}>
            Programmer une routine
          </Button>
        }
      />
      <QueryBoundary queries={[...planning.queries, ...queries]}>
        {() => (
          <Stack>
            <div className={styles.toolbar}>
              <Tabs
                variant="segmented"
                label="Affichage"
                value={view}
                onChange={(v) => setParam({ vue: v === 'week' ? 'semaine' : null })}
                items={[
                  { value: 'list', label: 'Planifications' },
                  { value: 'week', label: 'Semaine' },
                ]}
              />
              <SelectField
                label="Routine"
                placeholder="Toutes les routines"
                options={routines.map((r) => ({ value: r.id, label: r.title }))}
                value={routineFilter}
                onChange={(e) => setParam({ routine: e.target.value || null })}
                className={styles.filter}
              />
            </div>

            {view === 'list' ? (
              <>
                <Tabs
                  label="Statut"
                  value={status}
                  onChange={(v) => setParam({ statut: v === 'cancelled' ? 'annulees' : null })}
                  items={[
                    { value: 'active', label: 'Actives', count: planning.source!.schedules.filter((s) => s.status === 'active').length },
                    { value: 'cancelled', label: 'Annulées' },
                  ]}
                />
                <Panel flush>
                  <DataTable
                    caption="Planifications"
                    rows={schedules}
                    columns={columns}
                    rowKey={(s) => s.id}
                    initialSort={{ id: 'when', direction: 'asc' }}
                    search={{
                      placeholder: 'Rechercher (routine, personne, équipe)',
                      text: (s) =>
                        `${routineById.get(s.routineId)?.title ?? ''} ${lookups ? assignmentLabel(s, lookups.userName, lookups.teamName) : ''}`,
                    }}
                    empty={{
                      title: status === 'active' ? 'Aucune routine programmée.' : 'Aucune planification annulée.',
                      action:
                        status === 'active' ? (
                          <Button variant="primary" onClick={() => setParam({ nouvelle: 'vide' })}>
                            Programmer une routine
                          </Button>
                        ) : undefined,
                    }}
                  />
                </Panel>
              </>
            ) : (
              <WeekView
                weekStart={weekStart}
                onWeek={(d) => setParam({ semaine: d === startOfWeek(today) ? null : d })}
                render={(day) => {
                  const occ = occurrencesBetween(planning.source!, day, day, (s) => !routineFilter || s.routineId === routineFilter);
                  if (occ.length === 0) return <p className={styles.empty}>Rien de planifié.</p>;
                  return (
                    <ul className={styles.occurrences}>
                      {occ.map((o) => {
                        const state = occurrenceState(o, today, now, settings.routineLateToleranceMinutes);
                        return (
                          <li key={o.key} className={cx(styles.occurrence, styles[state])}>
                            <span className={styles.time}>{o.time}</span>
                            <Link to={occurrencePath(o)} className={styles.title}>
                              {o.routine.title}
                            </Link>
                            <span className={styles.meta}>{assignmentLabel(o.schedule, lookups!.userName, lookups!.teamName)}</span>
                            <span className={styles.foot}>
                              <Badge tone={OCCURRENCE_STATE[state].tone}>{OCCURRENCE_STATE[state].label}</Badge>
                              {!o.run && o.date >= today && (
                                <button
                                  type="button"
                                  className={styles.skip}
                                  onClick={async () => {
                                    if (
                                      await confirm({
                                        title: 'Annuler cette occurrence ?',
                                        message: `${o.routine.title} du ${formatLongDate(o.date)} ne sera pas à faire. Les autres occurrences restent planifiées.`,
                                        confirmLabel: 'Annuler l’occurrence',
                                      })
                                    )
                                      skip.mutate({ schedule: o.schedule, date: o.date });
                                  }}
                                >
                                  Annuler
                                </button>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  );
                }}
              />
            )}
          </Stack>
        )}
      </QueryBoundary>

      <Drawer
        open={Boolean(editingId || newFor)}
        onClose={() => setParam({ modifier: null, nouvelle: null })}
        title={editingId ? 'Modifier la planification' : 'Programmer une routine'}
        size="md"
      >
        {(editingId || newFor) && lookups && planning.source && (
          <ScheduleForm
            key={editingId ?? newFor ?? ''}
            schedule={editingId ? planning.source.schedules.find((s) => s.id === editingId) : undefined}
            routines={routines}
            initialRoutineId={newFor && newFor !== 'vide' ? newFor : undefined}
            lookups={lookups}
            onDone={() => setParam({ modifier: null, nouvelle: null })}
          />
        )}
      </Drawer>
    </>
  );
}

function WeekView({
  weekStart,
  onWeek,
  render,
}: {
  weekStart: string;
  onWeek: (d: string) => void;
  render: (day: string) => React.ReactNode;
}) {
  const today = todayKey();
  const days = enumerateDays(weekStart, addDays(weekStart, 6));
  return (
    <>
      <div className={styles.week}>
        <IconButton
          label="Semaine précédente"
          variant="secondary"
          icon={<ChevronLeft size={18} />}
          onClick={() => onWeek(addDays(weekStart, -7))}
        />
        <span className={styles.weekLabel}>
          Semaine du {formatDate(weekStart)} au {formatDate(addDays(weekStart, 6))}
        </span>
        <IconButton
          label="Semaine suivante"
          variant="secondary"
          icon={<ChevronRight size={18} />}
          onClick={() => onWeek(addDays(weekStart, 7))}
        />
      </div>
      {days.length === 0 ? (
        <EmptyState title="Aucun jour à afficher." />
      ) : (
        <div className={styles.grid}>
          {days.map((day) => (
            <section key={day} className={cx(styles.day, day === today && styles.today)} aria-labelledby={`wk-${day}`}>
              <h2 id={`wk-${day}`} className={styles.dayTitle}>
                {formatLongDate(day)}
              </h2>
              {render(day)}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

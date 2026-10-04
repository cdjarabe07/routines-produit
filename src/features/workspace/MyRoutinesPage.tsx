import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Kpi, KpiStrip } from '@/components/ui/Kpi';
import { Tabs } from '@/components/ui/Tabs';
import { Panel } from '@/components/ui/Panel';
import { usePlanningData } from '@/features/planning/api';
import { TriggerButton } from '@/features/planning/components/TriggerButton';
import { describeRecurrence, isAssignedTo } from '@/features/planning/model';
import { useLookups, useSettings } from '@/features/shared/api';
import { useNow } from '@/hooks/useNow';
import { addDays, formatLongDate, todayKey } from '@/utils/date';
import { OccurrenceCard } from './components/OccurrenceCard';
import { myOccurrences, type MyOccurrence } from './model';
import styles from './MyRoutinesPage.module.css';

type View = 'today' | 'late' | 'upcoming' | 'done';
const VIEWS: View[] = ['today', 'late', 'upcoming', 'done'];
const WINDOW_DAYS = 7;

/** Mes routines : aujourd'hui, en retard, à venir, terminées (7 jours autour d'aujourd'hui). */
export function MyRoutinesPage() {
  const user = useCurrentUser();
  const now = useNow(60_000);
  const today = todayKey();
  const { settings } = useSettings();
  const [params, setParams] = useSearchParams();
  const view = (VIEWS as string[]).includes(params.get('vue') ?? '') ? (params.get('vue') as View) : 'today';
  const planning = usePlanningData({ from: addDays(today, -WINDOW_DAYS), to: addDays(today, WINDOW_DAYS) });
  const { queries, lookups } = useLookups();

  const all = useMemo(
    () =>
      planning.source
        ? myOccurrences(
            planning.source,
            user,
            addDays(today, -WINDOW_DAYS),
            addDays(today, WINDOW_DAYS),
            today,
            now,
            settings.routineLateToleranceMinutes,
          )
        : [],
    [planning.source, user, today, now, settings.routineLateToleranceMinutes],
  );

  const groups: Record<View, MyOccurrence[]> = {
    today: all.filter((o) => o.date === today),
    late: all
      .filter((o) => o.state === 'late' || o.state === 'missed')
      .sort((a, b) => b.date.localeCompare(a.date) || a.time.localeCompare(b.time)),
    upcoming: all.filter((o) => o.date > today),
    done: all.filter((o) => o.state === 'done').sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)),
  };
  const todays = groups.today;
  // Routines sur événement affectées : déclenchées depuis cette page (changement de série, d'outil…)
  const onDemand = (planning.source?.schedules ?? []).filter(
    (s) => s.status === 'active' && s.recurrence === 'on_demand' && isAssignedTo(s, user),
  );
  const routineTitle = (id: string) => planning.source?.routines.find((r) => r.id === id)?.title ?? 'Routine';
  const count = (s: MyOccurrence['state']) => todays.filter((o) => o.state === s).length;

  const EMPTY: Record<View, string> = {
    today: 'Aucune routine planifiée pour vous aujourd’hui.',
    late: 'Aucune routine en retard ou non réalisée sur les 7 derniers jours.',
    upcoming: 'Aucune routine planifiée pour vous dans les 7 prochains jours.',
    done: 'Aucune routine terminée sur les 7 derniers jours.',
  };

  return (
    <>
      <PageHeader
        title="Mes routines"
        description="Les routines qui vous sont affectées, directement ou via votre équipe. Démarrez-les à l’heure prévue."
      />
      <QueryBoundary queries={[...planning.queries, ...queries]}>
        {() => (
          <Stack>
            <KpiStrip>
              <Kpi label="En cours" value={count('in_progress')} />
              <Kpi label="À faire" value={count('due')} tone={count('due') ? 'warning' : 'neutral'} />
              <Kpi
                label="En retard"
                value={count('late')}
                tone={count('late') ? 'danger' : 'neutral'}
                detail={`Tolérance ${settings.routineLateToleranceMinutes} min`}
              />
              <Kpi
                label="Terminées aujourd’hui"
                value={`${count('done')}/${todays.length}`}
                tone={todays.length > 0 && count('done') === todays.length ? 'success' : 'neutral'}
              />
            </KpiStrip>

            {onDemand.length > 0 && (
              <Panel
                title="Sur événement"
                description="À déclencher lors d’un changement de série, d’outil, de lot… La routine s’ajoute alors à aujourd’hui."
              >
                <ul className={styles.onDemand}>
                  {onDemand.map((s) => (
                    <li key={s.id}>
                      <span>
                        <strong>{routineTitle(s.routineId)}</strong>
                        <span className={styles.onDemandMeta}>{describeRecurrence(s)}</span>
                      </span>
                      <TriggerButton schedule={s} title={routineTitle(s.routineId)} />
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            <Tabs
              label="Vue"
              value={view}
              onChange={(v) => setParams(v === 'today' ? {} : { vue: v }, { replace: true })}
              items={[
                { value: 'today', label: 'Aujourd’hui', count: todays.length },
                { value: 'late', label: 'En retard', count: groups.late.length },
                { value: 'upcoming', label: 'À venir', count: groups.upcoming.length },
                { value: 'done', label: 'Terminées', count: groups.done.length },
              ]}
            />

            {groups[view].length === 0 ? (
              <EmptyState title={EMPTY[view]} />
            ) : (
              <DayGroups
                items={groups[view]}
                today={today}
                render={(o) => (
                  <OccurrenceCard
                    key={o.key}
                    occurrence={o}
                    checklists={planning.checklistById}
                    zone={
                      [
                        lookups!.lineName(o.schedule.lineId),
                        o.schedule.workstationId ? lookups!.workstationById.get(o.schedule.workstationId)?.code : null,
                      ]
                        .filter((v) => v && v !== '—')
                        .join(' · ') || undefined
                    }
                  />
                )}
              />
            )}
          </Stack>
        )}
      </QueryBoundary>
    </>
  );
}

function DayGroups({ items, today, render }: { items: MyOccurrence[]; today: string; render: (o: MyOccurrence) => React.ReactNode }) {
  const days = Array.from(new Set(items.map((o) => o.date)));
  return (
    <div className={styles.days}>
      {days.map((day) => (
        <section key={day} aria-labelledby={`day-${day}`}>
          <h2 id={`day-${day}`} className={styles.day}>
            {day === today ? 'Aujourd’hui' : formatLongDate(day)}
          </h2>
          <div className={styles.cards}>{items.filter((o) => o.date === day).map(render)}</div>
        </section>
      ))}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { DateNavigator } from '@/components/ui/DateNavigator';
import { TextField } from '@/components/ui/Field';
import { Tabs } from '@/components/ui/Tabs';
import { usePlanningData } from '@/features/planning/api';
import { useSettings } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useNow } from '@/hooks/useNow';
import { addDays, daysBetween, enumerateDays, formatDate, formatLongDate, startOfWeek, todayKey } from '@/utils/date';
import { cx } from '@/utils/cx';
import { buildPlanning, myOccurrences, type PlanningKind } from './model';
import styles from './MyPlanningPage.module.css';

type View = 'day' | 'week' | 'period';
const MAX_PERIOD_DAYS = 62;

/** Mon planning : routines affectées, réunions et formations, actions à échéance. */
export function MyPlanningPage() {
  const user = useCurrentUser();
  const now = useNow(60_000);
  const today = todayKey();
  const { settings } = useSettings();
  const [params, setParams] = useSearchParams();
  const view: View = params.get('vue') === 'semaine' ? 'week' : params.get('vue') === 'periode' ? 'period' : 'day';
  const date = params.get('date') ?? today;
  const range = useMemo(() => {
    if (view === 'day') return { from: date, to: date };
    if (view === 'week') {
      const from = startOfWeek(date);
      return { from, to: addDays(from, 6) };
    }
    const from = params.get('du') ?? today;
    const to = params.get('au') ?? addDays(today, 13);
    return from <= to && daysBetween(from, to) < MAX_PERIOD_DAYS ? { from, to } : { from: today, to: addDays(today, 13) };
  }, [view, date, params, today]);
  const planning = usePlanningData(range);
  const meetings = useCollection('meetings');
  const actions = useCollection('actions');

  const entries = useMemo(() => {
    if (!planning.source || !meetings.data || !actions.data) return [];
    const occurrences = myOccurrences(planning.source, user, range.from, range.to, today, now, settings.routineLateToleranceMinutes);
    return buildPlanning({ occurrences, meetings: meetings.data, actions: actions.data, user, from: range.from, to: range.to, today });
  }, [planning.source, meetings.data, actions.data, user, range, today, now, settings.routineLateToleranceMinutes]);

  const setView = (v: View) => setParams(v === 'day' ? {} : v === 'week' ? { vue: 'semaine' } : { vue: 'periode' }, { replace: true });
  const setDate = (d: string) => {
    const p = new URLSearchParams(params);
    if (d === today) p.delete('date');
    else p.set('date', d);
    setParams(p, { replace: true });
  };

  const days = view === 'day' ? [range.from] : enumerateDays(range.from, range.to);

  return (
    <>
      <PageHeader title="Mon planning" description="Ce qui vous est affecté : routines, réunions et formations, actions à échéance." />
      <Stack>
        <div className={styles.toolbar}>
          <Tabs
            variant="segmented"
            label="Affichage"
            value={view}
            onChange={setView}
            items={[
              { value: 'day', label: 'Jour' },
              { value: 'week', label: 'Semaine' },
              { value: 'period', label: 'Période' },
            ]}
          />
          {view === 'day' && <DateNavigator value={date} onChange={setDate} allowFuture />}
          {view === 'week' && (
            <div className={styles.week}>
              <IconButton
                label="Semaine précédente"
                variant="secondary"
                icon={<ChevronLeft size={18} />}
                onClick={() => setDate(addDays(range.from, -7))}
              />
              <span className={styles.weekLabel}>
                Semaine du {formatDate(range.from)} au {formatDate(range.to)}
              </span>
              <IconButton
                label="Semaine suivante"
                variant="secondary"
                icon={<ChevronRight size={18} />}
                onClick={() => setDate(addDays(range.from, 7))}
              />
              {(today < range.from || today > range.to) && (
                <Button size="sm" variant="ghost" onClick={() => setDate(today)}>
                  Cette semaine
                </Button>
              )}
            </div>
          )}
          {view === 'period' && (
            <PeriodForm from={range.from} to={range.to} onApply={(du, au) => setParams({ vue: 'periode', du, au }, { replace: true })} />
          )}
        </div>

        <QueryBoundary queries={[...planning.queries, meetings, actions]}>
          {() =>
            entries.length === 0 ? (
              <EmptyState
                title={view === 'day' ? 'Rien de planifié pour vous ce jour-là.' : 'Rien de planifié pour vous sur cette période.'}
              />
            ) : (
              <div className={styles.days}>
                {days.map((day) => {
                  const items = entries.filter((e) => e.date === day);
                  if (view !== 'day' && items.length === 0) return null;
                  return (
                    <section key={day} aria-labelledby={`pl-${day}`} className={cx(styles.dayBlock, day === today && styles.today)}>
                      <h2 id={`pl-${day}`} className={styles.dayTitle}>
                        {day === today ? `Aujourd’hui — ${formatLongDate(day)}` : formatLongDate(day)}
                      </h2>
                      <ul className={styles.entries}>
                        {items.map((e) => (
                          <li key={e.id} className={cx(styles.entry, styles[e.kind])}>
                            <span className={styles.time}>{e.time ? `${e.time}${e.endTime ? `–${e.endTime}` : ''}` : 'Échéance'}</span>
                            <span className={styles.main}>
                              <span className={styles.kind}>{e.kindLabel}</span>
                              <Link to={e.to} className={styles.title}>
                                {e.title}
                              </Link>
                              {e.detail && <span className={styles.detail}>{e.detail}</span>}
                            </span>
                            <Badge tone={e.state.tone}>{e.state.label}</Badge>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )
          }
        </QueryBoundary>
        <Legend />
      </Stack>
    </>
  );
}

function PeriodForm({ from, to, onApply }: { from: string; to: string; onApply: (from: string, to: string) => void }) {
  const [du, setDu] = useState(from);
  const [au, setAu] = useState(to);
  const error =
    !du || !au
      ? 'Indiquez les deux dates'
      : du > au
        ? 'La fin doit suivre le début'
        : daysBetween(du, au) >= MAX_PERIOD_DAYS
          ? `${MAX_PERIOD_DAYS} jours au maximum`
          : null;
  return (
    <form
      className={styles.period}
      onSubmit={(e) => {
        e.preventDefault();
        if (!error) onApply(du, au);
      }}
    >
      <TextField label="Du" type="date" value={du} onChange={(e) => setDu(e.target.value)} />
      <TextField
        label="Au"
        type="date"
        value={au}
        onChange={(e) => setAu(e.target.value)}
        error={du && au ? (error ?? undefined) : undefined}
      />
      <Button type="submit" variant="primary" disabled={Boolean(error)}>
        Afficher
      </Button>
    </form>
  );
}

const KINDS: { kind: PlanningKind; label: string }[] = [
  { kind: 'routine', label: 'Routine' },
  { kind: 'event', label: 'Réunion, formation, événement' },
  { kind: 'action', label: 'Action à échéance' },
];

function Legend() {
  return (
    <ul className={styles.legend} aria-label="Légende">
      {KINDS.map((k) => (
        <li key={k.kind} className={styles[k.kind]}>
          {k.label}
        </li>
      ))}
    </ul>
  );
}

import { useMemo } from 'react';
import { Link } from 'react-router';
import { CalendarPlus, ClipboardPlus, UserPlus } from 'lucide-react';
import { ItemList } from '@/components/data-display/ItemList';
import { QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Kpi, KpiStrip } from '@/components/ui/Kpi';
import { Panel } from '@/components/ui/Panel';
import { isOpenAction, isOverdue } from '@/features/actions/model';
import { isOpenAlert } from '@/features/andon/model';
import { MEETING_STATUS } from '@/features/meetings/model';
import { useMyNotifications } from '@/features/notifications/api';
import { usePlanningData } from '@/features/planning/api';
import { OCCURRENCE_STATE, assignmentLabel, countOccurrences, occurrenceState, occurrencesBetween } from '@/features/planning/model';
import { DEFINITIONS } from '@/features/shared/definitions';
import { EVENT_TYPE } from '@/features/shared/labels';
import { useLookups, useSettings } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useNow } from '@/hooks/useNow';
import { addDays, formatDateTime, formatLongDate, todayKey } from '@/utils/date';
import { formatPercent, ratio } from '@/utils/format';

/** Cockpit d'administration : ce qui est configuré, planifié, réalisé ; ce qui demande une intervention. */
export function AdminDashboardPage() {
  const now = useNow(60_000);
  const today = todayKey();
  const { settings } = useSettings();
  // Aujourd'hui et les 6 jours précédents (indicateurs de la semaine)
  const planning = usePlanningData({ from: addDays(today, -6), to: today });
  const alerts = useCollection('andonAlerts');
  const actions = useCollection('actions');
  const meetings = useCollection('meetings');
  const knowledge = useCollection('knowledgeItems');
  const { queries, lookups } = useLookups();
  const notifications = useMyNotifications();

  const stats = useMemo(() => {
    if (!planning.source) return null;
    const tol = settings.routineLateToleranceMinutes;
    const todays = occurrencesBetween(planning.source, today, today);
    const week = occurrencesBetween(planning.source, addDays(today, -6), today);
    const weekCounts = countOccurrences(week, today, now, tol);
    const routinesWithoutSchedule = planning.source.routines.filter(
      (r) => r.active && !planning.source!.schedules.some((s) => s.routineId === r.id && s.status === 'active'),
    );
    return {
      todays,
      today: countOccurrences(todays, today, now, tol),
      weekPct: ratio(weekCounts.done, weekCounts.planned - weekCounts.upcoming - weekCounts.due),
      activeRoutines: planning.source.routines.filter((r) => r.active).length,
      activeSchedules: planning.source.schedules.filter((s) => s.status === 'active').length,
      routinesWithoutSchedule,
      late: todays.filter((o) => occurrenceState(o, today, now, tol) === 'late'),
    };
  }, [planning.source, today, now, settings.routineLateToleranceMinutes]);

  return (
    <>
      <PageHeader
        title="Administration"
        description={`${formatLongDate(now)} · configuration, planification et état de réalisation`}
        actions={
          <>
            <ButtonLink to="/admin/routines" icon={<ClipboardPlus size={16} aria-hidden />}>
              Routines
            </ButtonLink>
            <ButtonLink to="/admin/planification?nouvelle=vide" variant="primary" icon={<CalendarPlus size={16} aria-hidden />}>
              Programmer une routine
            </ButtonLink>
          </>
        }
      />
      <QueryBoundary queries={[...planning.queries, alerts, actions, meetings, knowledge, ...queries]}>
        {() => {
          if (!stats) return null;
          const openActions = actions.data!.filter(isOpenAction);
          const overdueActions = openActions.filter((a) => isOverdue(a, today));
          const openAlerts = alerts.data!.filter(isOpenAlert);
          const todayMeetings = meetings.data!.filter((m) => m.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
          const requests = notifications.items.filter((n) => n.kind === 'access_request' && !n.readAt);
          const toReview = knowledge.data!.filter((k) => k.toReview && k.status !== 'archived').length;
          const inactiveUsers = lookups!.users.filter((u) => !u.active).length;
          const noTeam = lookups!.activeUsers.filter(
            (u) => !u.teamId && u.role !== 'admin' && u.role !== 'manager' && u.role !== 'line_leader',
          ).length;

          return (
            <Stack>
              <KpiStrip>
                <Kpi
                  label="Activités planifiées aujourd’hui"
                  value={stats.today.planned}
                  detail={`${stats.activeSchedules} planification(s) active(s)`}
                  to="/admin/planification?vue=semaine"
                />
                <Kpi
                  label="Terminées"
                  value={stats.today.done}
                  tone={stats.today.done && stats.today.done === stats.today.planned ? 'success' : 'neutral'}
                  detail={`${stats.today.inProgress} en cours`}
                />
                <Kpi
                  label="En retard"
                  value={stats.today.late}
                  tone={stats.today.late ? 'danger' : 'neutral'}
                  detail={`Tolérance ${settings.routineLateToleranceMinutes} min`}
                  to="/manager/routines?vue=retard"
                />
              </KpiStrip>
              <KpiStrip>
                <Kpi
                  label="Routines actives"
                  value={stats.activeRoutines}
                  detail={
                    stats.routinesWithoutSchedule.length
                      ? `${stats.routinesWithoutSchedule.length} sans planification`
                      : 'toutes planifiées'
                  }
                  to="/admin/routines"
                />
                <Kpi
                  label="Andon actifs"
                  value={openAlerts.length}
                  tone={openAlerts.some((a) => a.status === 'active') ? 'danger' : 'neutral'}
                  to="/andon"
                />
                <Kpi
                  label="Actions ouvertes"
                  value={openActions.length}
                  tone={overdueActions.length ? 'warning' : 'neutral'}
                  detail={`${overdueActions.length} en retard`}
                  to="/manager/actions"
                />
                <Kpi label="Réunions du jour" value={todayMeetings.length} to="/admin/agenda" />
                <Kpi
                  label="Réalisation sur 7 jours"
                  definition={DEFINITIONS.routinePct}
                  value={formatPercent(stats.weekPct)}
                  to="/manager/reporting"
                />
              </KpiStrip>

              <Columns>
                <Stack>
                  <Panel title="Routines en retard aujourd’hui" flush>
                    <ItemList
                      items={stats.late.map((o) => ({
                        id: o.key,
                        title: `${o.time} · ${o.routine.title}`,
                        meta: assignmentLabel(o.schedule, lookups!.userName, lookups!.teamName),
                        aside: <Badge tone={OCCURRENCE_STATE.late.tone}>{OCCURRENCE_STATE.late.label}</Badge>,
                        to: `/app/routines/${o.schedule.id}/${o.date}`,
                        tone: 'danger' as const,
                      }))}
                      empty="Aucune routine en retard."
                    />
                  </Panel>
                  <Panel
                    title="Routines actives sans planification"
                    description="Elles ne seront exécutées par personne tant qu’elles ne sont pas programmées."
                    flush
                  >
                    <ItemList
                      items={stats.routinesWithoutSchedule.map((r) => ({
                        id: r.id,
                        title: r.title,
                        meta: `${r.tasks.length} tâche(s) · ${r.durationMin} min`,
                        to: `/admin/planification?nouvelle=${r.id}`,
                        aside: <Badge tone="warning">À programmer</Badge>,
                      }))}
                      empty="Toutes les routines actives sont planifiées."
                    />
                  </Panel>
                </Stack>
                <Stack>
                  <Panel title="Demandes à traiter" flush>
                    <ItemList
                      items={[
                        ...requests.map((n) => ({ id: n.id, title: n.title, meta: formatDateTime(n.createdAt), to: n.link })),
                        ...(toReview
                          ? [
                              {
                                id: 'kb',
                                title: `${toReview} document(s) à valider`,
                                meta: 'Centre de connaissances',
                                to: '/admin/connaissances',
                              },
                            ]
                          : []),
                        ...(noTeam
                          ? [
                              {
                                id: 'team',
                                title: `${noTeam} personne(s) sans équipe`,
                                meta: 'Elles ne voient pas les routines affectées aux équipes',
                                to: '/admin/utilisateurs',
                              },
                            ]
                          : []),
                      ]}
                      empty="Aucune demande en attente."
                    />
                  </Panel>
                  <Panel title="Réunions et événements du jour" flush>
                    <ItemList
                      items={todayMeetings.map((m) => ({
                        id: m.id,
                        title: `${m.startTime} · ${m.title}`,
                        meta: `${EVENT_TYPE[m.type]} · ${lookups!.userName(m.organizerId)}`,
                        aside: <Badge tone={MEETING_STATUS[m.status].tone}>{MEETING_STATUS[m.status].label}</Badge>,
                        to: `/reunions/${m.id}`,
                      }))}
                      empty="Aucune réunion prévue."
                    />
                  </Panel>
                  <Panel title="Organisation">
                    <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: 'var(--text-sm)' }}>
                      <li>
                        <Link to="/admin/utilisateurs">{lookups!.activeUsers.length} utilisateurs actifs</Link>
                        {inactiveUsers > 0 && ` · ${inactiveUsers} désactivé(s)`}
                      </li>
                      <li>
                        <Link to="/admin/equipes">{lookups!.teams.filter((t) => t.active).length} équipes</Link>
                      </li>
                      <li>
                        <Link to="/admin/postes">{lookups!.workstations.filter((w) => w.active).length} postes</Link>
                      </li>
                    </ul>
                    <div style={{ marginTop: 'var(--space-3)' }}>
                      <ButtonLink to="/admin/utilisateurs?nouveau=1" size="sm" icon={<UserPlus size={15} aria-hidden />}>
                        Nouvel utilisateur
                      </ButtonLink>
                    </div>
                  </Panel>
                </Stack>
              </Columns>
            </Stack>
          );
        }}
      </QueryBoundary>
    </>
  );
}

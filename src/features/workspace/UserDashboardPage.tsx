import { occurrencePath } from '@/features/planning/model';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { CalendarClock, Siren } from 'lucide-react';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { ItemList } from '@/components/data-display/ItemList';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { isOpenAction, isOverdue, sortActions } from '@/features/actions/model';
import { ANDON_STATUS, ANDON_TYPE, isOpenAlert } from '@/features/andon/model';
import { meetingsForUser, nextMeeting } from '@/features/meetings/model';
import { useMyNotifications } from '@/features/notifications/api';
import { usePlanningData } from '@/features/planning/api';
import { useLookups, useSettings } from '@/features/shared/api';
import { ACTION_STATUS, EVENT_TYPE } from '@/features/shared/labels';
import { useCollection } from '@/hooks/useData';
import { useNow } from '@/hooks/useNow';
import { formatDate, formatDateTime, formatLongDate, formatTime, minutesOfDay, todayKey } from '@/utils/date';
import { OccurrenceCard } from './components/OccurrenceCard';
import { currentAndNext, myOccurrences } from './model';
import styles from './UserDashboardPage.module.css';

/** Tableau de bord personnel : « Qu'est-ce que je dois faire maintenant ? » */
export function UserDashboardPage() {
  const user = useCurrentUser();
  const now = useNow(30_000);
  const today = todayKey();
  const { settings } = useSettings();
  const planning = usePlanningData({ from: today, to: today });
  const { queries, lookups } = useLookups();
  const actions = useCollection('actions');
  const meetings = useCollection('meetings');
  const alerts = useCollection('andonAlerts');
  const announcements = useCollection('announcements');
  const notifications = useMyNotifications();

  const occurrences = useMemo(
    () => (planning.source ? myOccurrences(planning.source, user, today, today, today, now, settings.routineLateToleranceMinutes) : []),
    [planning.source, user, today, now, settings.routineLateToleranceMinutes],
  );
  const firstName = user.name.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`Bonjour ${firstName}`}
        description={
          <>
            {formatLongDate(now)}
            {lookups && user.teamId && ` · ${lookups.teamName(user.teamId)}`}
            {lookups && user.workstationId && ` · ${lookups.workstationName(user.workstationId)}`}
          </>
        }
      />
      <QueryBoundary queries={[...planning.queries, ...queries, actions, meetings, alerts, announcements]}>
        {() => {
          const { current, next } = currentAndNext(occurrences);
          const myAlerts = alerts.data!.filter((a) => a.raisedBy === user.id && isOpenAlert(a));
          const myActions = sortActions(
            actions.data!.filter((a) => isOpenAction(a) && (a.assigneeId === user.id || a.backupId === user.id)),
            today,
          );
          const upcomingMeeting = nextMeeting(meetingsForUser(meetings.data!, user), today, minutesOfDay(now));
          const announcement = announcements.data!.find((a) => a.date === today);
          const done = occurrences.filter((o) => o.state === 'done');
          const unread = notifications.items.filter((n) => !n.readAt).slice(0, 4);
          const zoneOf = (lineId?: string, wsId?: string) =>
            [lineId ? lookups!.lineName(lineId) : null, wsId ? lookups!.workstationById.get(wsId)?.code : null]
              .filter(Boolean)
              .join(' · ') || undefined;

          return (
            <Stack>
              {myAlerts.map((a) => (
                <div key={a.id} className={styles.andon} role="status">
                  <Siren size={22} aria-hidden />
                  <div className={styles.andonText}>
                    <strong>Andon actif · {lookups!.workstationName(a.workstationId)}</strong>
                    <span>
                      {ANDON_TYPE[a.type].label} — {a.detail} · depuis {formatTime(a.raisedAt)} · {ANDON_STATUS[a.status].label}
                      {a.acknowledgedBy && ` par ${lookups!.userName(a.acknowledgedBy)}`}
                    </span>
                  </div>
                  <ButtonLink to={`/andon/${a.id}`} size="sm" className={styles.andonButton}>
                    Voir le problème
                  </ButtonLink>
                </div>
              ))}

              <section aria-labelledby="now-title" className={styles.now}>
                <h2 id="now-title" className={styles.sectionTitle}>
                  Maintenant
                </h2>
                {current ? (
                  <OccurrenceCard
                    occurrence={current}
                    checklists={planning.checklistById}
                    zone={zoneOf(current.schedule.lineId, current.schedule.workstationId)}
                    emphasis
                  />
                ) : (
                  <p className={styles.calm}>Aucune routine à faire pour l’instant.</p>
                )}
                {next && (
                  <p className={styles.next}>
                    <CalendarClock size={16} aria-hidden /> Ensuite : <strong>{next.routine.title}</strong> à {next.time}
                  </p>
                )}
              </section>

              <Columns>
                <Stack>
                  <Panel
                    title="Mes routines du jour"
                    actions={
                      <Link to="/app/routines" className={styles.more}>
                        Toutes mes routines
                      </Link>
                    }
                  >
                    {occurrences.length === 0 ? (
                      <EmptyState compact title="Aucune routine planifiée pour vous aujourd’hui." />
                    ) : (
                      <div className={styles.cards}>
                        {occurrences.map((o) => (
                          <OccurrenceCard
                            key={o.key}
                            occurrence={o}
                            checklists={planning.checklistById}
                            zone={zoneOf(o.schedule.lineId, o.schedule.workstationId)}
                          />
                        ))}
                      </div>
                    )}
                  </Panel>

                  <Panel
                    title="Mes tâches"
                    description="Actions qui vous sont confiées"
                    actions={
                      <Link to="/app/actions" className={styles.more}>
                        Toutes mes actions
                      </Link>
                    }
                    flush
                  >
                    <ItemList
                      items={myActions.slice(0, 5).map((a) => ({
                        id: a.id,
                        title: a.title,
                        to: `/actions/${a.id}`,
                        meta: `Échéance ${formatDate(a.dueDate)}`,
                        aside: isOverdue(a, today) ? (
                          <Badge tone="danger">En retard</Badge>
                        ) : (
                          <Badge tone={ACTION_STATUS[a.status].tone}>{ACTION_STATUS[a.status].label}</Badge>
                        ),
                        tone: isOverdue(a, today) ? 'danger' : undefined,
                      }))}
                      empty="Aucune action en attente."
                    />
                  </Panel>
                </Stack>

                <Stack>
                  <Panel title="Prochaine réunion">
                    {upcomingMeeting ? (
                      <div className={styles.meeting}>
                        <Badge>{EVENT_TYPE[upcomingMeeting.type]}</Badge>
                        <Link to={`/reunions/${upcomingMeeting.id}`} className={styles.meetingTitle}>
                          {upcomingMeeting.title}
                        </Link>
                        <p className={styles.meetingMeta}>
                          {upcomingMeeting.date === today ? 'Aujourd’hui' : formatLongDate(upcomingMeeting.date)} ·{' '}
                          {upcomingMeeting.startTime} – {upcomingMeeting.endTime}
                          {upcomingMeeting.location && ` · ${upcomingMeeting.location}`}
                        </p>
                      </div>
                    ) : (
                      <EmptyState compact title="Aucune réunion prévue." />
                    )}
                  </Panel>

                  <Panel title="Alertes" flush>
                    {announcement || unread.length ? (
                      <ul className={styles.alerts}>
                        {announcement && (
                          <li>
                            <span className={styles.alertLabel}>Annonce du jour</span>
                            {announcement.text}
                          </li>
                        )}
                        {unread.map((n) => (
                          <li key={n.id}>
                            {n.link ? <Link to={n.link}>{n.title}</Link> : n.title}
                            <span className={styles.alertDate}>{formatDateTime(n.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyState compact title="Aucune alerte." />
                    )}
                  </Panel>

                  <Panel title="Fait aujourd’hui" flush>
                    <ItemList
                      items={done.map((o) => ({
                        id: o.key,
                        title: o.routine.title,
                        to: occurrencePath(o),
                        meta: o.run?.completedAt ? `Terminée à ${formatTime(o.run.completedAt)}` : undefined,
                        aside: <Badge tone="success">Terminée</Badge>,
                      }))}
                      empty="Rien de terminé pour l’instant."
                    />
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

import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ClipboardList } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { ItemList } from '@/components/data-display/ItemList';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Kpi, KpiStrip } from '@/components/ui/Kpi';
import { Panel } from '@/components/ui/Panel';
import { Progress } from '@/components/ui/Progress';
import { MEETING_STATUS } from '@/features/meetings/model';
import { usePlanningData } from '@/features/planning/api';
import { occurrencesBetween } from '@/features/planning/model';
import { DEFINITIONS } from '@/features/shared/definitions';
import { EVENT_TYPE, SHIFT } from '@/features/shared/labels';
import { useLookups, useSettings } from '@/features/shared/api';
import { MEMBER_STATUS, memberStatus, teamMembers, type MemberStatus } from '@/features/team/model';
import { useCollection } from '@/hooks/useData';
import { useNow } from '@/hooks/useNow';
import { formatLongDate, formatTime, todayKey } from '@/utils/date';
import { formatPercent } from '@/utils/format';
import { AnnouncementPanel } from './components/AnnouncementPanel';
import { DailyReportDrawer } from './components/DailyReportDrawer';
import { LineStatusStrip } from './components/LineStatusStrip';
import {
  buildDailyReport,
  buildPriorities,
  dayIndicators,
  lineStatuses,
  routinesByPerson,
  type CockpitData,
  type PersonRoutines,
} from './model';

/** Vue d'ensemble de la supervision : équipe, production, routines, anomalies, Andon, actions, indicateurs. */
export function DashboardPage() {
  const user = useCurrentUser();
  const { can } = useAuth();
  const now = useNow(30_000);
  const today = todayKey();
  const { settings } = useSettings();
  const [reportOpen, setReportOpen] = useState(false);

  const planning = usePlanningData();
  const alerts = useCollection('andonAlerts');
  const actions = useCollection('actions');
  const anomalies = useCollection('anomalies');
  const meetings = useCollection('meetings');
  const stocks = useCollection('materialStocks');
  const orders = useCollection('productionOrders');
  const handovers = useCollection('handovers');
  const checks = useCollection('qualityChecks');
  const announcements = useCollection('announcements');
  const presence = useCollection('presence');
  const leaves = useCollection('leaves');
  const { queries, lookups } = useLookups();
  const all = [
    alerts,
    actions,
    anomalies,
    meetings,
    stocks,
    orders,
    handovers,
    checks,
    announcements,
    presence,
    leaves,
    ...planning.queries,
    ...queries,
  ];

  const data = useMemo<CockpitData | null>(() => {
    if (!lookups || !planning.source || all.some((q) => !q.data)) return null;
    return {
      user,
      now,
      today,
      can,
      lines: lookups.lines,
      workstations: lookups.workstations,
      alerts: alerts.data!,
      actions: actions.data!,
      anomalies: anomalies.data!,
      occurrences: occurrencesBetween(planning.source, today, today),
      meetings: meetings.data!,
      stocks: stocks.data!,
      orders: orders.data!,
      handovers: handovers.data!,
      checks: checks.data!,
      escalationMinutes: settings.andonEscalationMinutes,
      toleranceMinutes: settings.routineLateToleranceMinutes,
      workstationName: lookups.workstationName,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dépend des données de chaque requête
  }, [
    user,
    now,
    today,
    can,
    lookups,
    settings,
    planning.source,
    alerts.data,
    actions.data,
    anomalies.data,
    meetings.data,
    stocks.data,
    orders.data,
    handovers.data,
    checks.data,
  ]);

  const hour = now.getHours();
  const greeting = hour < 5 || hour >= 18 ? 'Bonsoir' : 'Bonjour';

  return (
    <>
      <PageHeader
        title={`${greeting} ${user.name.split(' ')[0]}`}
        description={`${formatLongDate(now)}${user.shift ? ` · ${SHIFT[user.shift]}` : ''} · vue d’ensemble de l’atelier`}
        actions={
          <Button icon={<ClipboardList size={16} aria-hidden />} onClick={() => setReportOpen(true)} disabled={!data}>
            Rapport du jour
          </Button>
        }
      />
      <QueryBoundary queries={all}>
        {() => {
          if (!data) return null;
          const priorities = buildPriorities(data);
          const statuses = lineStatuses(data);
          const ind = dayIndicators(data);
          const { people, teamPending } = routinesByPerson(data.occurrences, today, now, settings.routineLateToleranceMinutes);
          const announcement = announcements
            .data!.filter((a) => a.date === today)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
          const lastHandover = [...data.handovers].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          const todayMeetings = data.meetings.filter((m) => m.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
          const members = teamMembers(lookups!.users);
          const presenceCounts = members.reduce<Record<MemberStatus, number>>(
            (acc, m) => {
              acc[memberStatus(m.id, today, presence.data!, leaves.data!)] += 1;
              return acc;
            },
            { present: 0, absent: 0, on_leave: 0, unknown: 0 },
          );

          const personColumns: Column<PersonRoutines>[] = [
            {
              id: 'name',
              header: 'Personne',
              mobile: 'title',
              cell: (p) => lookups!.userName(p.userId),
              sortValue: (p) => lookups!.userName(p.userId),
            },
            {
              id: 'progress',
              header: 'Terminées',
              mobile: 'meta',
              width: '200px',
              cell: (p) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 60 }}>
                    <Progress
                      value={p.done}
                      max={p.planned}
                      size="sm"
                      tone={p.done === p.planned ? 'success' : 'info'}
                      label={`Routines terminées par ${lookups!.userName(p.userId)}`}
                    />
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)' }}>
                    {p.done}/{p.planned}
                  </span>
                </div>
              ),
              sortValue: (p) => p.done / p.planned,
            },
            {
              id: 'progressNow',
              header: 'En cours',
              align: 'center',
              mobile: 'meta',
              cell: (p) => p.inProgress || '—',
              sortValue: (p) => p.inProgress,
            },
            {
              id: 'late',
              header: 'En retard',
              align: 'center',
              mobile: 'aside',
              cell: (p) => (p.late ? <Badge tone="danger">{p.late}</Badge> : '—'),
              sortValue: (p) => p.late,
            },
          ];

          return (
            <Stack>
              <LineStatusStrip statuses={statuses} criticalAnomalies={ind.criticalAnomalies} />

              <KpiStrip>
                <Kpi
                  label="Routines réalisées"
                  definition={DEFINITIONS.routinePct}
                  value={formatPercent(ind.routinePct)}
                  detail={ind.routineDetail}
                  to="/manager/routines"
                />
                <Kpi
                  label="Routines en retard"
                  value={ind.routines.late}
                  tone={ind.routines.late ? 'danger' : 'success'}
                  detail={`${ind.routines.inProgress} en cours`}
                  to="/manager/routines?vue=retard"
                />
                <Kpi
                  label="Andon en cours"
                  value={ind.openAndon}
                  tone={ind.waitingAndon ? 'danger' : 'neutral'}
                  detail={`${ind.waitingAndon} sans prise en charge`}
                  to="/andon"
                />
                <Kpi
                  label="Actions en retard"
                  definition={DEFINITIONS.overdueActions}
                  value={ind.overdueActions}
                  tone={ind.overdueActions ? 'danger' : 'success'}
                  detail={`${ind.openActions} ouverte(s) · ${ind.dueToday} à échéance aujourd’hui`}
                  to={can('action.manage') ? '/manager/actions?vue=overdue' : '/app/actions'}
                />
                <Kpi
                  label="Anomalies ouvertes"
                  definition={DEFINITIONS.openAnomalies}
                  value={ind.openAnomalies}
                  tone={ind.criticalAnomalies ? 'danger' : 'neutral'}
                  detail={`${ind.criticalAnomalies} critique(s)`}
                  to={can('anomaly.manage') ? '/manager/anomalies' : undefined}
                />
                <Kpi
                  label="Conformité LQC"
                  definition={DEFINITIONS.quality}
                  value={formatPercent(ind.qualityPct, 1)}
                  tone={ind.qualityPct !== null && ind.qualityPct < 95 ? 'warning' : 'neutral'}
                  detail={ind.qualityCount ? `${ind.qualityCount} mesure(s) aujourd’hui` : 'Aucune mesure aujourd’hui'}
                  to={can('quality.record') ? '/manager/qualite' : undefined}
                />
              </KpiStrip>

              <Columns>
                <Stack>
                  <Panel
                    title="À traiter maintenant"
                    description="Classé par urgence : Andon, retards, routines, réunion, stocks, passation."
                    accent={priorities.some((p) => p.level === 'critical') ? 'danger' : undefined}
                    flush
                  >
                    {priorities.length === 0 ? (
                      <EmptyState compact title="Rien d’urgent : aucun Andon, aucun retard, routines à jour." />
                    ) : (
                      <ItemList
                        label="Priorités"
                        items={priorities.map((p) => ({
                          id: p.id,
                          title: p.title,
                          meta: p.meta,
                          to: p.to,
                          tone: p.level === 'critical' ? 'danger' : p.level === 'high' ? 'warning' : undefined,
                          aside:
                            p.level === 'critical' ? (
                              <Badge tone="danger" strong>
                                Urgent
                              </Badge>
                            ) : undefined,
                        }))}
                      />
                    )}
                  </Panel>

                  {can('routine.supervise') && (
                    <Panel
                      title="Routines de l’équipe aujourd’hui"
                      description={
                        teamPending.size
                          ? `Non démarrées, affectées à une équipe : ${Array.from(teamPending.entries())
                              .map(([id, n]) => `${lookups!.teamName(id)} (${n})`)
                              .join(', ')}`
                          : undefined
                      }
                      flush
                      actions={
                        <ButtonLink to="/manager/routines" size="sm" variant="ghost">
                          Suivi détaillé
                        </ButtonLink>
                      }
                    >
                      <DataTable
                        caption="Routines du jour par personne"
                        rows={people}
                        columns={personColumns}
                        rowKey={(p) => p.userId}
                        initialSort={{ id: 'late', direction: 'desc' }}
                        empty={{ title: 'Aucune routine planifiée aujourd’hui.' }}
                      />
                    </Panel>
                  )}
                </Stack>

                <Stack>
                  <AnnouncementPanel
                    key={announcement?.id ?? 'none'}
                    announcement={announcement}
                    authorName={lookups!.userName(announcement?.authorId)}
                  />

                  {can('team.updateStatus') && (
                    <Panel
                      title="Équipe"
                      actions={
                        <ButtonLink to="/manager/equipe" size="sm" variant="ghost">
                          Présences
                        </ButtonLink>
                      }
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                        {(Object.keys(presenceCounts) as MemberStatus[]).map((s) => (
                          <Badge key={s} tone={MEMBER_STATUS[s].tone}>
                            {MEMBER_STATUS[s].label} : {presenceCounts[s]}
                          </Badge>
                        ))}
                      </div>
                    </Panel>
                  )}

                  <Panel title="Réunions et événements du jour" flush>
                    <ItemList
                      items={todayMeetings.map((m) => ({
                        id: m.id,
                        title: `${m.startTime} · ${m.title}`,
                        meta: `${EVENT_TYPE[m.type]} · ${lookups!.userName(m.organizerId)}${m.location ? ` · ${m.location}` : ''}`,
                        aside: <Badge tone={MEETING_STATUS[m.status].tone}>{MEETING_STATUS[m.status].label}</Badge>,
                        to: `/reunions/${m.id}`,
                      }))}
                      empty="Aucune réunion prévue."
                    />
                  </Panel>

                  <Panel
                    title="Dernière passation"
                    actions={
                      <ButtonLink to="/app/passation" size="sm" variant="ghost">
                        Passations
                      </ButtonLink>
                    }
                  >
                    {lastHandover ? (
                      <>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-1)' }}>
                          {SHIFT[lastHandover.fromShift]} → {SHIFT[lastHandover.toShift]} · {lookups!.userName(lastHandover.authorId)} ·{' '}
                          {formatTime(lastHandover.createdAt)}
                        </p>
                        <p>{lastHandover.note}</p>
                        {!lastHandover.acknowledgedAt && (
                          <div style={{ marginTop: 'var(--space-2)' }}>
                            <Badge tone="warning">Non lue par l’équipe suivante</Badge>
                          </div>
                        )}
                      </>
                    ) : (
                      <p style={{ color: 'var(--color-text-muted)' }}>Aucune passation enregistrée.</p>
                    )}
                  </Panel>

                  <p style={{ fontSize: 'var(--text-sm)' }}>
                    <Link to="/manager/production">Production et stocks</Link> · <Link to="/manager/atelier">Plan de l’atelier</Link>
                  </p>
                </Stack>
              </Columns>
            </Stack>
          );
        }}
      </QueryBoundary>
      {data && (
        <DailyReportDrawer
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          text={reportOpen ? buildDailyReport(data, settings.plantName) : ''}
        />
      )}
    </>
  );
}

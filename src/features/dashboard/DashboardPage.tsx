import { useMemo, useState } from 'react';
import { CalendarClock, ClipboardList, ClipboardCheck, Users } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { ItemList } from '@/components/data-display/ItemList';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Kpi, KpiStrip } from '@/components/ui/Kpi';
import { Panel } from '@/components/ui/Panel';
import { buildDayAgenda } from '@/features/meetings/model';
import { ROUTINE_STATE, findRun, routineState, runProgress, templatesForRole } from '@/features/routines/model';
import { SHIFT } from '@/features/shared/labels';
import { useLookups, useSettings } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useNow } from '@/hooks/useNow';
import { formatLongDate, formatTime, minutesOfDay, timeToMinutes, todayKey } from '@/utils/date';
import { formatPercent } from '@/utils/format';
import { AnnouncementPanel } from './components/AnnouncementPanel';
import { DailyReportDrawer } from './components/DailyReportDrawer';
import { LineStatusStrip } from './components/LineStatusStrip';
import { buildDailyReport, buildPriorities, dayIndicators, lineStatuses, type CockpitData } from './model';

export function DashboardPage() {
  const user = useCurrentUser();
  const { can } = useAuth();
  const now = useNow(30_000);
  const today = todayKey();
  const { settings } = useSettings();
  const [reportOpen, setReportOpen] = useState(false);

  const alerts = useCollection('andonAlerts');
  const actions = useCollection('actions');
  const anomalies = useCollection('anomalies');
  const templates = useCollection('routineTemplates');
  const runs = useCollection('routineRuns');
  const meetings = useCollection('meetings');
  const stocks = useCollection('materialStocks');
  const orders = useCollection('productionOrders');
  const handovers = useCollection('handovers');
  const checks = useCollection('qualityChecks');
  const announcements = useCollection('announcements');
  const { queries, lookups } = useLookups();
  const all = [alerts, actions, anomalies, templates, runs, meetings, stocks, orders, handovers, checks, announcements, ...queries];

  const data = useMemo<CockpitData | null>(() => {
    if (!lookups || all.some((q) => !q.data)) return null;
    return {
      user, now, today, can,
      lines: lookups.lines,
      workstations: lookups.workstations,
      alerts: alerts.data!, actions: actions.data!, anomalies: anomalies.data!, templates: templates.data!, runs: runs.data!,
      meetings: meetings.data!, stocks: stocks.data!, orders: orders.data!, handovers: handovers.data!, checks: checks.data!,
      escalationMinutes: settings.andonEscalationMinutes,
      toleranceMinutes: settings.routineLateToleranceMinutes,
      workstationName: lookups.workstationName,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dépend des données de chaque requête
  }, [user, now, today, can, lookups, settings, alerts.data, actions.data, anomalies.data, templates.data, runs.data, meetings.data, stocks.data, orders.data, handovers.data, checks.data]);

  const hour = now.getHours();
  const greeting = hour < 5 || hour >= 18 ? 'Bonsoir' : 'Bonjour';

  return (
    <>
      <PageHeader
        title={`${greeting} ${user.name.split(' ')[0]}`}
        description={`${formatLongDate(now)}${user.shift ? ` · ${SHIFT[user.shift]}` : ''}`}
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
          const myRoutines = can('routine.execute') ? templatesForRole(data.templates, user.role) : [];
          const agenda = buildDayAgenda(today, templatesForRole(data.templates, user.role), data.runs, data.meetings);
          const nowMinutes = minutesOfDay(now);
          const announcement = announcements.data!.filter((a) => a.date === today).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
          const lastHandover = [...data.handovers].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

          return (
            <Stack>
              <LineStatusStrip statuses={statuses} criticalAnomalies={ind.criticalAnomalies} />

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
                          aside: p.level === 'critical' ? <Badge tone="danger" strong>Urgent</Badge> : undefined,
                        }))}
                      />
                    )}
                  </Panel>

                  <KpiStrip>
                    <Kpi label="Routines du jour" value={formatPercent(ind.routinePct)} detail={ind.routineDetail} to="/routines" />
                    <Kpi label="Actions en retard" value={ind.overdueActions} tone={ind.overdueActions ? 'danger' : 'success'} detail={`${ind.dueToday} à échéance aujourd’hui`} to="/actions?vue=overdue" />
                    <Kpi label="Anomalies ouvertes" value={ind.openAnomalies} tone={ind.criticalAnomalies ? 'danger' : 'neutral'} detail={`${ind.criticalAnomalies} critique(s)`} to="/anomalies" />
                    <Kpi label="Conformité LQC" value={formatPercent(ind.qualityPct, 1)} tone={ind.qualityPct !== null && ind.qualityPct < 95 ? 'warning' : 'neutral'} detail={ind.qualityCount ? `${ind.qualityCount} mesure(s) aujourd’hui` : 'Aucune mesure aujourd’hui'} to="/qualite" />
                  </KpiStrip>

                  {myRoutines.length > 0 && (
                    <Panel title="Mes routines du jour" flush actions={<ButtonLink to="/routines" size="sm" variant="ghost">Tout voir</ButtonLink>}>
                      <ItemList
                        items={myRoutines.map((t) => {
                          const run = findRun(data.runs, t.id, today);
                          const p = runProgress(t, run);
                          const st = routineState(t, run, today, today, now, settings.routineLateToleranceMinutes);
                          return {
                            id: t.id,
                            leading: <ClipboardCheck size={18} />,
                            title: `${t.scheduledTime} — ${t.title}`,
                            meta: `${p.treated}/${p.total} points${p.ko ? ` · ${p.ko} non conforme(s)` : ''}`,
                            aside: <Badge tone={ROUTINE_STATE[st].tone}>{ROUTINE_STATE[st].label}</Badge>,
                            to: `/routines/${t.id}/${today}`,
                          };
                        })}
                      />
                    </Panel>
                  )}
                </Stack>

                <Stack>
                  <AnnouncementPanel key={announcement?.id ?? 'none'} announcement={announcement} authorName={lookups!.userName(announcement?.authorId)} />

                  <Panel title="Agenda du jour" flush actions={<ButtonLink to="/agenda" size="sm" variant="ghost">Agenda</ButtonLink>}>
                    {agenda.length === 0 ? (
                      <EmptyState compact title="Rien de planifié aujourd’hui pour votre rôle." />
                    ) : (
                      <ItemList
                        items={agenda.map((e) => ({
                          id: e.id,
                          leading: e.kind === 'meeting' ? <Users size={16} /> : <CalendarClock size={16} />,
                          title: `${e.time} · ${e.title}`,
                          meta: e.detail,
                          aside: e.done ? <Badge tone="success">Fait</Badge> : timeToMinutes(e.time) <= nowMinutes ? <Badge tone="warning">À faire</Badge> : undefined,
                          to: e.to,
                        }))}
                      />
                    )}
                  </Panel>

                  <Panel title="Dernière passation" actions={<ButtonLink to="/passation" size="sm" variant="ghost">Passations</ButtonLink>}>
                    {lastHandover ? (
                      <>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-1)' }}>
                          {SHIFT[lastHandover.fromShift]} → {SHIFT[lastHandover.toShift]} · {lookups!.userName(lastHandover.authorId)} · {formatTime(lastHandover.createdAt)}
                        </p>
                        <p>{lastHandover.note}</p>
                        {!lastHandover.acknowledgedAt && <div style={{ marginTop: 'var(--space-2)' }}><Badge tone="warning">Non lue par l’équipe suivante</Badge></div>}
                      </>
                    ) : (
                      <p style={{ color: 'var(--color-text-muted)' }}>Aucune passation enregistrée.</p>
                    )}
                  </Panel>
                </Stack>
              </Columns>
            </Stack>
          );
        }}
      </QueryBoundary>
      {data && <DailyReportDrawer open={reportOpen} onClose={() => setReportOpen(false)} text={reportOpen ? buildDailyReport(data, settings.plantName) : ''} />}
    </>
  );
}

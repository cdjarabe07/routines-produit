import type {
  Action, AndonAlert, Anomaly, DateKey, Handover, Line, MaterialStock, Meeting, ProductionOrder, QualityCheck,
  RoutineRun, RoutineTemplate, User, Workstation,
} from '@/types/domain';
import type { Permission } from '@/services/auth/permissions';
import { isOverdue, isDueToday, isOpenAction } from '@/features/actions/model';
import { ANDON_TYPE, isEscalated, isOpenAlert } from '@/features/andon/model';
import { isOpenAnomaly } from '@/features/anomalies/model';
import { needsReorder } from '@/features/production/model';
import { checksOn, conformity } from '@/features/quality/model';
import { dayCompletion, findRun, routineState, runProgress, templatesForRole } from '@/features/routines/model';
import { dateKeyOf, formatLongDate, formatMinutes, formatTime, minutesBetween, minutesOfDay, timeToMinutes } from '@/utils/date';
import { formatPercent, ratio } from '@/utils/format';

export interface CockpitData {
  user: User;
  now: Date;
  today: DateKey;
  can: (p: Permission) => boolean;
  lines: Line[];
  workstations: Workstation[];
  alerts: AndonAlert[];
  actions: Action[];
  anomalies: Anomaly[];
  templates: RoutineTemplate[];
  runs: RoutineRun[];
  meetings: Meeting[];
  stocks: MaterialStock[];
  orders: ProductionOrder[];
  handovers: Handover[];
  checks: QualityCheck[];
  escalationMinutes: number;
  toleranceMinutes: number;
  workstationName: (id?: string) => string;
}

export interface Priority {
  id: string;
  level: 'critical' | 'high' | 'normal';
  title: string;
  meta: string;
  to: string;
}

/**
 * « À traiter maintenant » — ordre de priorité (docs/functional-spec.md §5.1) :
 * Andon actifs > actions en retard > routines dont l'heure est passée > réunion à tenir
 * > stocks sous le minimum > passation manquante après 12 h.
 */
export function buildPriorities(d: CockpitData): Priority[] {
  const out: Priority[] = [];

  // En attente de prise en charge d'abord, puis les plus anciennes
  const openAlerts = d.alerts
    .filter(isOpenAlert)
    .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.raisedAt.localeCompare(b.raisedAt));
  for (const a of openAlerts) {
    const escalated = isEscalated(a, d.now, d.escalationMinutes);
    out.push({
      id: `andon-${a.id}`,
      level: a.status === 'active' ? 'critical' : 'high',
      title: `Andon ${ANDON_TYPE[a.type].label.toLowerCase()} — ${d.workstationName(a.workstationId)}`,
      meta: `${a.detail} · ${a.status === 'active' ? (escalated ? 'escaladé, en attente' : 'en attente') : 'pris en charge'} depuis ${formatMinutes(minutesBetween(a.raisedAt, d.now))}`,
      to: '/andon',
    });
  }

  const overdue = d.actions
    .filter((a) => isOverdue(a, d.today) && (a.assigneeId === d.user.id || a.backupId === d.user.id || d.can('action.manage')))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  for (const a of overdue.slice(0, 5)) {
    out.push({ id: `action-${a.id}`, level: 'high', title: a.title, meta: `Action en retard depuis le ${formatLongDate(a.dueDate)}`, to: `/actions/${a.id}` });
  }
  if (overdue.length > 5) out.push({ id: 'action-more', level: 'high', title: `${overdue.length - 5} autre(s) action(s) en retard`, meta: 'Voir toutes les actions en retard', to: '/actions?vue=overdue' });

  if (d.can('routine.execute')) {
    for (const t of templatesForRole(d.templates, d.user.role)) {
      const run = findRun(d.runs, t.id, d.today);
      const state = routineState(t, run, d.today, d.today, d.now, d.toleranceMinutes);
      if (state === 'late' || state === 'due') {
        const p = runProgress(t, run);
        out.push({
          id: `routine-${t.id}`,
          level: state === 'late' ? 'high' : 'normal',
          title: `Routine ${t.scheduledTime} — ${t.title}`,
          meta: `${p.total - p.treated} point(s) à traiter${state === 'late' ? ' · en retard' : ''}`,
          to: `/routines/${t.id}/${d.today}`,
        });
      }
    }
  }

  if (d.can('meeting.manage')) {
    const meeting = d.meetings.find((m) => m.date === d.today && m.status !== 'done');
    if (meeting && minutesOfDay(d.now) >= timeToMinutes(meeting.startTime)) {
      out.push({ id: `meeting-${meeting.id}`, level: 'normal', title: `${meeting.title} (${meeting.startTime})`, meta: 'Réunion du jour pas encore clôturée', to: `/reunions/${meeting.id}` });
    }
  }

  if (d.can('production.update')) {
    const low = d.stocks.filter(needsReorder);
    if (low.length) out.push({ id: 'stocks', level: 'normal', title: `${low.length} stock(s) matière sous le minimum`, meta: low.map((s) => s.material).join(' · '), to: '/production?vue=stocks' });
  }

  if (d.can('handover.write') && d.now.getHours() >= 12) {
    const since = new Date(d.now);
    since.setHours(0, 0, 0, 0);
    const written = d.handovers.some((h) => h.authorId === d.user.id && new Date(h.createdAt) >= since);
    if (!written) out.push({ id: 'handover', level: 'normal', title: 'Rédiger la passation de poste', meta: 'Aucune passation publiée par vous aujourd’hui', to: '/passation' });
  }

  return out;
}

export interface LineStatus {
  line: Line;
  openAndon: number;
  waitingAndon: number;
  blockedOrders: ProductionOrder[];
  lowStocks: number;
  state: 'stopped' | 'degraded' | 'running';
}

export function lineStatuses(d: Pick<CockpitData, 'lines' | 'workstations' | 'alerts' | 'orders' | 'stocks'>): LineStatus[] {
  return d.lines.map((line) => {
    const stationIds = new Set(d.workstations.filter((w) => w.lineId === line.id).map((w) => w.id));
    const alerts = d.alerts.filter((a) => isOpenAlert(a) && stationIds.has(a.workstationId));
    const blockedOrders = d.orders.filter((o) => o.lineId === line.id && o.status === 'blocked');
    const lowStocks = d.stocks.filter((s) => stationIds.has(s.workstationId) && needsReorder(s)).length;
    const waitingAndon = alerts.filter((a) => a.status === 'active').length;
    const state = waitingAndon > 0 || alerts.some((a) => a.urgency === 'critical') ? 'stopped' : alerts.length || blockedOrders.length || lowStocks ? 'degraded' : 'running';
    return { line, openAndon: alerts.length, waitingAndon, blockedOrders, lowStocks, state };
  });
}

export function dayIndicators(d: Pick<CockpitData, 'templates' | 'runs' | 'actions' | 'anomalies' | 'checks' | 'today'>) {
  const completion = dayCompletion(d.templates, d.runs, d.today);
  const openActions = d.actions.filter(isOpenAction);
  return {
    routinePct: ratio(completion.treated, completion.total),
    routineDetail: `${completion.treated}/${completion.total} points · ${completion.completedRoutines}/${completion.routines} routines`,
    overdueActions: openActions.filter((a) => isOverdue(a, d.today)).length,
    dueToday: openActions.filter((a) => isDueToday(a, d.today)).length,
    openAnomalies: d.anomalies.filter(isOpenAnomaly).length,
    criticalAnomalies: d.anomalies.filter((a) => isOpenAnomaly(a) && a.severity === 'critical').length,
    qualityPct: conformity(checksOn(d.checks, d.today)),
    qualityCount: checksOn(d.checks, d.today).length,
  };
}

/** Rapport du jour en texte brut, à coller dans un email ou une messagerie. */
export function buildDailyReport(d: CockpitData, plantName: string): string {
  const ind = dayIndicators(d);
  const lines = lineStatuses(d);
  const anomaliesToday = d.anomalies.filter((a) => dateKeyOf(a.createdAt) === d.today);
  const alertsToday = d.alerts.filter((a) => dateKeyOf(a.raisedAt) === d.today);
  const stateLabel = { stopped: 'ARRÊT / Andon en attente', degraded: 'perturbée', running: 'nominale' };

  const out = [
    `RAPPORT DU JOUR — ${plantName}`,
    formatLongDate(d.now),
    '',
    'ÉTAT DES LIGNES',
    ...lines.map((l) => `• ${l.line.name} : ${stateLabel[l.state]}${l.openAndon ? ` (${l.openAndon} Andon ouvert)` : ''}${l.blockedOrders.length ? ` — ${l.blockedOrders.length} OF bloqué` : ''}`),
    '',
    'INDICATEURS',
    `• Routines : ${formatPercent(ind.routinePct)} des points traités (${ind.routineDetail})`,
    `• Conformité LQC : ${formatPercent(ind.qualityPct, 1)} (${ind.qualityCount} mesure(s))`,
    `• Andon déclenchés aujourd’hui : ${alertsToday.length}`,
    `• Anomalies déclarées aujourd’hui : ${anomaliesToday.length} — ouvertes au total : ${ind.openAnomalies} (dont ${ind.criticalAnomalies} critique(s))`,
    `• Actions en retard : ${ind.overdueActions} — à échéance aujourd’hui : ${ind.dueToday}`,
  ];
  if (anomaliesToday.length) {
    out.push('', 'ANOMALIES DU JOUR', ...anomaliesToday.map((a) => `• ${d.workstationName(a.workstationId)} — ${a.description}`));
  }
  out.push('', `Généré le ${formatLongDate(d.now)} à ${formatTime(d.now)} par ${d.user.name}, à partir des données saisies dans l’application.`);
  return out.join('\n');
}

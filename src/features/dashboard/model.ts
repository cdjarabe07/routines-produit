import type {
  Action,
  AndonAlert,
  Anomaly,
  DateKey,
  Handover,
  Line,
  MaterialStock,
  Meeting,
  ProductionOrder,
  QualityCheck,
  User,
  Workstation,
} from '@/types/domain';
import type { Permission } from '@/services/auth/permissions';
import type { PolicyResource } from '@/services/auth/policies';
import { isOverdue, isDueToday, isOpenAction } from '@/features/actions/model';
import { ANDON_TYPE, isEscalated, isOpenAlert } from '@/features/andon/model';
import { isOpenAnomaly } from '@/features/anomalies/model';
import { countOccurrences, isAssignedTo, occurrenceState, type Occurrence, occurrencePath } from '@/features/planning/model';
import { needsReorder } from '@/features/production/model';
import { checksOn, conformity } from '@/features/quality/model';
import { dateKeyOf, formatLongDate, formatMinutes, formatTime, minutesBetween, minutesOfDay, timeToMinutes } from '@/utils/date';
import { formatPercent, ratio } from '@/utils/format';

export interface CockpitData {
  user: User;
  now: Date;
  today: DateKey;
  can: (p: Permission, resource?: PolicyResource) => boolean;
  /** Module production actif (Paramètres) ; absent = actif */
  productionEnabled?: boolean;
  lines: Line[];
  workstations: Workstation[];
  alerts: AndonAlert[];
  actions: Action[];
  anomalies: Anomaly[];
  /** Occurrences planifiées du jour (toutes personnes) */
  occurrences: Occurrence[];
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
 * « À traiter maintenant » — ordre de priorité :
 * Andon actifs > actions en retard > mes routines dont l'heure est passée > routines en retard de l'équipe
 * > réunion à tenir > stocks sous le minimum > passation manquante après 12 h.
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
      to: `/andon/${a.id}`,
    });
  }

  const overdue = d.actions
    .filter((a) => isOverdue(a, d.today) && (a.assigneeId === d.user.id || a.backupId === d.user.id || d.can('action.manage')))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  for (const a of overdue.slice(0, 5)) {
    out.push({
      id: `action-${a.id}`,
      level: 'high',
      title: a.title,
      meta: `Action en retard depuis le ${formatLongDate(a.dueDate)}`,
      to: `/actions/${a.id}`,
    });
  }
  if (overdue.length > 5)
    out.push({
      id: 'action-more',
      level: 'high',
      title: `${overdue.length - 5} autre(s) action(s) en retard`,
      meta: 'Voir toutes les actions en retard',
      to: d.can('action.manage') ? '/manager/actions?vue=overdue' : '/app/actions?vue=overdue',
    });

  if (d.can('routine.execute')) {
    for (const o of d.occurrences.filter((x) => isAssignedTo(x.schedule, d.user))) {
      const state = occurrenceState(o, d.today, d.now, d.toleranceMinutes);
      if (state === 'late' || state === 'due' || state === 'in_progress') {
        out.push({
          id: `routine-${o.key}`,
          level: state === 'late' ? 'high' : 'normal',
          title: `Ma routine ${o.time} — ${o.routine.title}`,
          meta: state === 'in_progress' ? 'En cours' : state === 'late' ? 'En retard' : 'À faire maintenant',
          to: occurrencePath(o),
        });
      }
    }
  }

  if (d.can('routine.supervise')) {
    const others = d.occurrences.filter(
      (o) => !isAssignedTo(o.schedule, d.user) && occurrenceState(o, d.today, d.now, d.toleranceMinutes) === 'late',
    );
    if (others.length)
      out.push({
        id: 'team-late',
        level: 'high',
        title: `${others.length} routine(s) en retard dans l’atelier`,
        meta: others
          .slice(0, 3)
          .map((o) => `${o.time} ${o.routine.title}`)
          .join(' · '),
        to: '/manager/routines?vue=retard',
      });
  }

  const meeting = d.meetings.find(
    (m) =>
      m.date === d.today &&
      m.status !== 'done' &&
      m.status !== 'cancelled' &&
      d.can('meeting.run', { type: 'meeting', meeting: m }) &&
      m.organizerId === d.user.id,
  );
  if (meeting && minutesOfDay(d.now) >= timeToMinutes(meeting.startTime)) {
    out.push({
      id: `meeting-${meeting.id}`,
      level: 'normal',
      title: `${meeting.title} (${meeting.startTime})`,
      meta: 'Réunion dont vous êtes responsable, pas encore clôturée',
      to: `/reunions/${meeting.id}`,
    });
  }

  if (d.can('production.update') && d.productionEnabled !== false) {
    const low = d.stocks.filter(needsReorder);
    if (low.length)
      out.push({
        id: 'stocks',
        level: 'normal',
        title: `${low.length} stock(s) matière sous le minimum`,
        meta: low.map((s) => s.material).join(' · '),
        to: '/manager/production?vue=stocks',
      });
  }

  // Après midi (heure de l'atelier), sans passation rédigée depuis le début de la journée de l'atelier
  if (d.can('handover.write') && minutesOfDay(d.now) >= 12 * 60) {
    const written = d.handovers.some((h) => h.authorId === d.user.id && dateKeyOf(h.createdAt) === d.today);
    if (!written)
      out.push({
        id: 'handover',
        level: 'normal',
        title: 'Rédiger la passation de poste',
        meta: 'Aucune passation publiée par vous aujourd’hui',
        to: '/app/passation',
      });
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
    const state =
      waitingAndon > 0 || alerts.some((a) => a.urgency === 'critical')
        ? 'stopped'
        : alerts.length || blockedOrders.length || lowStocks
          ? 'degraded'
          : 'running';
    return { line, openAndon: alerts.length, waitingAndon, blockedOrders, lowStocks, state };
  });
}

export function dayIndicators(
  d: Pick<CockpitData, 'occurrences' | 'actions' | 'anomalies' | 'checks' | 'alerts' | 'today' | 'now' | 'toleranceMinutes'>,
) {
  const counts = countOccurrences(d.occurrences, d.today, d.now, d.toleranceMinutes);
  const openActions = d.actions.filter(isOpenAction);
  const dueSoFar = counts.planned - counts.upcoming;
  return {
    routines: counts,
    /** Terminées / échues à cet instant (les routines à venir ne comptent pas) */
    routinePct: ratio(counts.done, dueSoFar),
    routineDetail: `${counts.done} terminée(s) sur ${dueSoFar} échue(s) · ${counts.planned} programmée(s)`,
    overdueActions: openActions.filter((a) => isOverdue(a, d.today)).length,
    dueToday: openActions.filter((a) => isDueToday(a, d.today)).length,
    openActions: openActions.length,
    openAnomalies: d.anomalies.filter(isOpenAnomaly).length,
    criticalAnomalies: d.anomalies.filter((a) => isOpenAnomaly(a) && a.severity === 'critical').length,
    openAndon: d.alerts.filter(isOpenAlert).length,
    waitingAndon: d.alerts.filter((a) => a.status === 'active').length,
    qualityPct: conformity(checksOn(d.checks, d.today)),
    qualityCount: checksOn(d.checks, d.today).length,
  };
}

export interface PersonRoutines {
  userId: string;
  planned: number;
  done: number;
  inProgress: number;
  late: number;
  upcoming: number;
}

/** Routines du jour par personne (exécutant, ou personne affectée ; les occurrences d'équipe non démarrées vont à l'équipe). */
export function routinesByPerson(
  occurrences: Occurrence[],
  today: DateKey,
  now: Date,
  toleranceMin: number,
): { people: PersonRoutines[]; teamPending: Map<string, number> } {
  const map = new Map<string, PersonRoutines>();
  const teamPending = new Map<string, number>();
  for (const o of occurrences) {
    const owner = o.run?.assigneeId ?? o.schedule.assigneeId;
    const state = occurrenceState(o, today, now, toleranceMin);
    if (!owner) {
      if (o.schedule.teamId) teamPending.set(o.schedule.teamId, (teamPending.get(o.schedule.teamId) ?? 0) + 1);
      continue;
    }
    const p = map.get(owner) ?? { userId: owner, planned: 0, done: 0, inProgress: 0, late: 0, upcoming: 0 };
    p.planned += 1;
    if (state === 'done') p.done += 1;
    else if (state === 'in_progress') p.inProgress += 1;
    else if (state === 'late' || state === 'missed') p.late += 1;
    else if (state === 'upcoming') p.upcoming += 1;
    map.set(owner, p);
  }
  return { people: Array.from(map.values()), teamPending };
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
    ...lines.map(
      (l) =>
        `• ${l.line.name} : ${stateLabel[l.state]}${l.openAndon ? ` (${l.openAndon} Andon ouvert)` : ''}${l.blockedOrders.length ? ` — ${l.blockedOrders.length} OF bloqué` : ''}`,
    ),
    '',
    'INDICATEURS',
    `• Routines : ${formatPercent(ind.routinePct)} réalisées (${ind.routineDetail}) — en cours ${ind.routines.inProgress}, en retard ${ind.routines.late}`,
    `• Conformité LQC : ${formatPercent(ind.qualityPct, 1)} (${ind.qualityCount} mesure(s))`,
    `• Andon déclenchés aujourd’hui : ${alertsToday.length}`,
    `• Anomalies déclarées aujourd’hui : ${anomaliesToday.length} — ouvertes au total : ${ind.openAnomalies} (dont ${ind.criticalAnomalies} critique(s))`,
    `• Actions en retard : ${ind.overdueActions} — à échéance aujourd’hui : ${ind.dueToday}`,
  ];
  if (anomaliesToday.length) {
    out.push('', 'ANOMALIES DU JOUR', ...anomaliesToday.map((a) => `• ${d.workstationName(a.workstationId)} — ${a.description}`));
  }
  out.push(
    '',
    `Généré le ${formatLongDate(d.now)} à ${formatTime(d.now)} par ${d.user.name}, à partir des données saisies dans l’application.`,
  );
  return out.join('\n');
}

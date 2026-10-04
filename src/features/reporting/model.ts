import type { Action, AndonAlert, Anomaly, AnomalyCategory, DateKey, QualityCheck, Workstation } from '@/types/domain';
import { closureDays, isOpenAction } from '@/features/actions/model';
import { andonStats } from '@/features/andon/model';
import {
  completedOnTime,
  countOccurrences,
  occurrenceState,
  occurrencesBetween,
  type Occurrence,
  type OccurrenceSource,
} from '@/features/planning/model';
import { runSummary } from '@/features/routines/model';
import { conformity } from '@/features/quality/model';
import { addDays, dateKeyOf, daysBetween, enumerateDays, formatDate, startOfMonth, toDateKey } from '@/utils/date';
import { ratio } from '@/utils/format';

/* Indicateurs calculés UNIQUEMENT à partir des données saisies (docs/functional-spec.md §7).
   Routines : chaque occurrence planifiée compte (planification × date), réalisée ou non. */

/* ---------- Périodes ---------- */

export type PeriodPreset = '7d' | '30d' | 'month' | 'custom';

export interface Period {
  from: DateKey;
  to: DateKey;
  label: string;
}

export function resolvePeriod(preset: PeriodPreset, today: DateKey, custom?: { from?: string | null; to?: string | null }): Period {
  if (preset === '30d') return { from: addDays(today, -29), to: today, label: '30 derniers jours' };
  if (preset === 'month') return { from: startOfMonth(today), to: today, label: 'Mois en cours' };
  if (preset === 'custom' && custom?.from && custom?.to && custom.from <= custom.to) {
    return { from: custom.from, to: custom.to, label: `Du ${formatDate(custom.from)} au ${formatDate(custom.to)}` };
  }
  return { from: addDays(today, -6), to: today, label: '7 derniers jours' };
}

/** Période précédente de même durée, juste avant. */
export function previousPeriod(p: Period): Period {
  const length = daysBetween(p.from, p.to) + 1;
  const to = addDays(p.from, -1);
  return { from: addDays(to, -(length - 1)), to, label: 'Période précédente' };
}

/* ---------- Dimensions ---------- */

/** Filtre analytique. Ajouter une dimension = ajouter un champ ici et l'appliquer dans scope(). */
export interface Dimensions {
  lineId?: string;
}

export interface ReportSource extends OccurrenceSource {
  anomalies: Anomaly[];
  actions: Action[];
  alerts: AndonAlert[];
  checks: QualityCheck[];
  workstations: Workstation[];
}

function scope(src: ReportSource, dims: Dimensions): ReportSource {
  if (!dims.lineId) return src;
  const stations = new Set(src.workstations.filter((w) => w.lineId === dims.lineId).map((w) => w.id));
  const routineLine = new Map(src.routines.map((r) => [r.id, r.lineId]));
  return {
    ...src,
    schedules: src.schedules.filter((s) => (s.lineId ?? routineLine.get(s.routineId)) === dims.lineId),
    anomalies: src.anomalies.filter((a) => a.workstationId && stations.has(a.workstationId)),
    alerts: src.alerts.filter((a) => stations.has(a.workstationId)),
    checks: src.checks.filter((c) => stations.has(c.workstationId)),
  };
}

const inPeriod = (key: DateKey, p: Period) => key >= p.from && key <= p.to;

/* ---------- Indicateurs ---------- */

export interface ReportKpis {
  /** Occurrences planifiées dans la période */
  routinesPlanned: number;
  routinesDone: number;
  routinesInProgress: number;
  /** En retard (jour même) ou non réalisées (jours passés) */
  routinesLate: number;
  /** À venir ou à faire (pas encore échues) */
  routinesPending: number;
  /** Terminées / échues */
  routinePct: number | null;
  onTimePct: number | null;
  /** Durée réelle moyenne des routines terminées, en minutes */
  avgRoutineMin: number | null;
  anomalies: number;
  criticalAnomalies: number;
  actionsCreated: number;
  actionsClosed: number;
  avgClosureDays: number | null;
  overdueAtEnd: number;
  andonCount: number;
  andonAvgAckMin: number | null;
  andonAvgResMin: number | null;
  qualityPct: number | null;
  qualityCount: number;
}

export interface KpiOptions {
  /** Tolérance de retard des routines (paramètre de l'atelier) */
  toleranceMin: number;
  /** Instant de calcul : les occurrences pas encore échues ne comptent pas dans le taux */
  now: Date;
}

function routineIndicators(occurrences: Occurrence[], opts: KpiOptions) {
  const today = toDateKey(opts.now);
  const c = countOccurrences(occurrences, today, opts.now, opts.toleranceMin);
  const eligible = c.planned - c.upcoming - c.due;
  const done = occurrences.filter((o) => o.run?.completedAt);
  const durations = done.map((o) => runSummary(o.routine, new Map(), o.run).durationMin).filter((v): v is number => v !== null);
  return {
    counts: c,
    routinePct: ratio(c.done, eligible),
    onTimePct: ratio(done.filter((o) => completedOnTime(o, opts.toleranceMin)).length, eligible),
    avgRoutineMin: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
  };
}

export function computeKpis(
  source: ReportSource,
  p: Period,
  dims: Dimensions = {},
  opts: KpiOptions = { toleranceMin: 120, now: new Date() },
): ReportKpis {
  const s = scope(source, dims);
  const r = routineIndicators(occurrencesBetween(s, p.from, p.to), opts);
  const anomalies = s.anomalies.filter((a) => inPeriod(dateKeyOf(a.createdAt), p));
  const created = s.actions.filter((a) => inPeriod(dateKeyOf(a.createdAt), p));
  const closed = s.actions.filter((a) => a.status === 'done' && a.closedAt && inPeriod(dateKeyOf(a.closedAt), p));
  const closure = closed.map(closureDays).filter((v): v is number => v !== null);
  // En retard à la fin de la période : ouvertes à cette date et échéance antérieure
  const overdueAtEnd = s.actions.filter((a) => {
    if (dateKeyOf(a.createdAt) > p.to || a.dueDate >= p.to || a.status === 'cancelled') return false;
    return isOpenAction(a) || (a.closedAt !== undefined && dateKeyOf(a.closedAt) > p.to);
  }).length;
  const alerts = s.alerts.filter((a) => inPeriod(dateKeyOf(a.raisedAt), p));
  const stats = andonStats(alerts);
  const checks = s.checks.filter((c) => inPeriod(dateKeyOf(c.createdAt), p));

  return {
    routinesPlanned: r.counts.planned,
    routinesDone: r.counts.done,
    routinesInProgress: r.counts.inProgress,
    routinesLate: r.counts.late + r.counts.missed,
    routinesPending: r.counts.upcoming + r.counts.due,
    routinePct: r.routinePct,
    onTimePct: r.onTimePct,
    avgRoutineMin: r.avgRoutineMin,
    anomalies: anomalies.length,
    criticalAnomalies: anomalies.filter((a) => a.severity === 'critical').length,
    actionsCreated: created.length,
    actionsClosed: closed.length,
    avgClosureDays: closure.length ? closure.reduce((a, b) => a + b, 0) / closure.length : null,
    overdueAtEnd,
    andonCount: stats.count,
    andonAvgAckMin: stats.avgAcknowledgeMin,
    andonAvgResMin: stats.avgResolutionMin,
    qualityPct: conformity(checks),
    qualityCount: checks.length,
  };
}

/** Nombre d'enregistrements datés dans la période : 0 = pas de base de comparaison. */
export function coverage(source: ReportSource, p: Period): number {
  const n = (keys: DateKey[]) => keys.filter((k) => inPeriod(k, p)).length;
  return (
    n(source.runs.map((r) => r.date)) +
    n(source.anomalies.map((a) => dateKeyOf(a.createdAt))) +
    n(source.alerts.map((a) => dateKeyOf(a.raisedAt))) +
    n(source.checks.map((c) => dateKeyOf(c.createdAt)))
  );
}

/* ---------- Séries journalières ---------- */

export interface DailyRow {
  date: DateKey;
  routinesPlanned: number;
  routinesDone: number;
  routinePct: number | null;
  anomalies: number;
  andon: number;
  actionsClosed: number;
  qualityPct: number | null;
}

export function dailySeries(
  source: ReportSource,
  p: Period,
  dims: Dimensions = {},
  opts: KpiOptions = { toleranceMin: 120, now: new Date() },
): DailyRow[] {
  const s = scope(source, dims);
  const occurrences = occurrencesBetween(s, p.from, p.to);
  return enumerateDays(p.from, p.to).map((date) => {
    const r = routineIndicators(
      occurrences.filter((o) => o.date === date),
      opts,
    );
    return {
      date,
      routinesPlanned: r.counts.planned,
      routinesDone: r.counts.done,
      routinePct: r.routinePct,
      anomalies: s.anomalies.filter((a) => dateKeyOf(a.createdAt) === date).length,
      andon: s.alerts.filter((a) => dateKeyOf(a.raisedAt) === date).length,
      actionsClosed: s.actions.filter((a) => a.status === 'done' && a.closedAt && dateKeyOf(a.closedAt) === date).length,
      qualityPct: conformity(s.checks.filter((q) => dateKeyOf(q.createdAt) === date)),
    };
  });
}

export function anomaliesByCategory(source: ReportSource, p: Period, dims: Dimensions = {}) {
  const counts = new Map<AnomalyCategory, number>();
  for (const a of scope(source, dims).anomalies)
    if (inPeriod(dateKeyOf(a.createdAt), p)) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function anomaliesByWorkstation(source: ReportSource, p: Period, dims: Dimensions = {}) {
  const counts = new Map<string, number>();
  for (const a of scope(source, dims).anomalies) {
    if (!a.workstationId || !inPeriod(dateKeyOf(a.createdAt), p)) continue;
    counts.set(a.workstationId, (counts.get(a.workstationId) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** Réalisation des routines par routine (occurrences planifiées vs terminées). */
export function routinesByTemplate(
  source: ReportSource,
  p: Period,
  dims: Dimensions = {},
  opts: KpiOptions = { toleranceMin: 120, now: new Date() },
) {
  const occurrences = occurrencesBetween(scope(source, dims), p.from, p.to);
  const byRoutine = new Map<string, Occurrence[]>();
  for (const o of occurrences) byRoutine.set(o.routine.id, [...(byRoutine.get(o.routine.id) ?? []), o]);
  return Array.from(byRoutine.values())
    .map((list) => {
      const r = routineIndicators(list, opts);
      return {
        routine: list[0]!.routine,
        planned: r.counts.planned,
        done: r.counts.done,
        late: r.counts.late + r.counts.missed,
        pct: r.routinePct,
        avgMin: r.avgRoutineMin,
      };
    })
    .sort((a, b) => (a.pct ?? 2) - (b.pct ?? 2));
}

/** Variation formatée et sens favorable (null si non comparable). */
export function delta(current: number | null, previous: number | null, higherIsBetter: boolean, unit: '%' | 'pts' | '' = '') {
  if (current === null || previous === null) return undefined;
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return { text: '= stable', favorable: null };
  const sign = diff > 0 ? '+' : '−';
  const value =
    unit === 'pts' ? `${Math.abs(diff).toFixed(1).replace('.', ',')} pt` : `${Math.round(Math.abs(diff) * 10) / 10}`.replace('.', ',');
  return { text: `${sign}${value}${unit === '%' ? ' %' : ''} vs période préc.`, favorable: diff > 0 === higherIsBetter };
}

/** Export CSV (séparateur « ; » pour Excel en français). */
export function toCsv(rows: DailyRow[]): string {
  const header = [
    'Date',
    'Routines programmées',
    'Routines terminées',
    'Routines réalisées (%)',
    'Anomalies déclarées',
    'Andon déclenchés',
    'Actions terminées',
    'Conformité qualité (%)',
  ];
  const fmt = (v: number | null) => (v === null ? '' : v.toFixed(1).replace('.', ','));
  return [
    header,
    ...rows.map((r) => [
      r.date,
      String(r.routinesPlanned),
      String(r.routinesDone),
      fmt(r.routinePct),
      String(r.anomalies),
      String(r.andon),
      String(r.actionsClosed),
      fmt(r.qualityPct),
    ]),
  ]
    .map((cols) => cols.join(';'))
    .join('\r\n');
}

/* ---------- Détail (exploration depuis les graphiques et tableaux) ---------- */

export type Drilldown =
  | { kind: 'day'; date: DateKey }
  | { kind: 'category'; category: AnomalyCategory }
  | { kind: 'station'; workstationId: string }
  | { kind: 'routine'; routineId: string };

export interface DrilldownResult {
  occurrences: (Occurrence & { state: ReturnType<typeof occurrenceState> })[];
  anomalies: Anomaly[];
  alerts: AndonAlert[];
  actionsClosed: Action[];
}

/** Enregistrements derrière un point de graphique ou une ligne de tableau, dans la période et le périmètre choisis. */
export function drilldown(
  source: ReportSource,
  p: Period,
  d: Drilldown,
  dims: Dimensions = {},
  opts: KpiOptions = { toleranceMin: 120, now: new Date() },
): DrilldownResult {
  const s = scope(source, dims);
  const today = toDateKey(opts.now);
  const withState = (list: Occurrence[]) => list.map((o) => ({ ...o, state: occurrenceState(o, today, opts.now, opts.toleranceMin) }));
  const byCreated = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt);
  switch (d.kind) {
    case 'day':
      return {
        occurrences: withState(occurrencesBetween(s, d.date, d.date)),
        anomalies: s.anomalies.filter((a) => dateKeyOf(a.createdAt) === d.date).sort(byCreated),
        alerts: s.alerts.filter((a) => dateKeyOf(a.raisedAt) === d.date).sort(byCreated),
        actionsClosed: s.actions.filter((a) => a.status === 'done' && a.closedAt && dateKeyOf(a.closedAt) === d.date),
      };
    case 'category':
    case 'station':
      return {
        occurrences: [],
        anomalies: s.anomalies
          .filter(
            (a) =>
              inPeriod(dateKeyOf(a.createdAt), p) &&
              (d.kind === 'category' ? a.category === d.category : a.workstationId === d.workstationId),
          )
          .sort(byCreated),
        alerts:
          d.kind === 'station'
            ? s.alerts.filter((a) => a.workstationId === d.workstationId && inPeriod(dateKeyOf(a.raisedAt), p)).sort(byCreated)
            : [],
        actionsClosed: [],
      };
    case 'routine':
      return {
        occurrences: withState(occurrencesBetween(s, p.from, p.to, (sc) => sc.routineId === d.routineId)).reverse(),
        anomalies: [],
        alerts: [],
        actionsClosed: [],
      };
  }
}

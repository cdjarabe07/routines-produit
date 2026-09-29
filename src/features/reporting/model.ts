import type {
  Action,
  AndonAlert,
  Anomaly,
  AnomalyCategory,
  DateKey,
  QualityCheck,
  RoutineRun,
  RoutineTemplate,
  Workstation,
} from '@/types/domain';
import { closureDays, isOpenAction } from '@/features/actions/model';
import { andonStats } from '@/features/andon/model';
import { conformity } from '@/features/quality/model';
import { completedOnTime, dayCompletion, findRun } from '@/features/routines/model';
import { addDays, atTime, dateKeyOf, daysBetween, enumerateDays, formatDate, parseDateKey, toDateKey } from '@/utils/date';
import { ratio } from '@/utils/format';

/* ---------- Périodes ---------- */

export type PeriodPreset = '7d' | '30d' | 'month' | 'custom';

export interface Period {
  from: DateKey;
  to: DateKey;
  label: string;
}

export function resolvePeriod(preset: PeriodPreset, today: DateKey, custom?: { from?: string | null; to?: string | null }): Period {
  if (preset === '30d') return { from: addDays(today, -29), to: today, label: '30 derniers jours' };
  if (preset === 'month') {
    const d = parseDateKey(today);
    return { from: toDateKey(new Date(d.getFullYear(), d.getMonth(), 1)), to: today, label: 'Mois en cours' };
  }
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

export interface ReportSource {
  templates: RoutineTemplate[];
  runs: RoutineRun[];
  anomalies: Anomaly[];
  actions: Action[];
  alerts: AndonAlert[];
  checks: QualityCheck[];
  workstations: Workstation[];
}

function scope(src: ReportSource, dims: Dimensions): ReportSource {
  if (!dims.lineId) return src;
  const stations = new Set(src.workstations.filter((w) => w.lineId === dims.lineId).map((w) => w.id));
  return {
    ...src,
    anomalies: src.anomalies.filter((a) => a.workstationId && stations.has(a.workstationId)),
    alerts: src.alerts.filter((a) => stations.has(a.workstationId)),
    checks: src.checks.filter((c) => stations.has(c.workstationId)),
  };
}

const inPeriod = (key: DateKey, p: Period) => key >= p.from && key <= p.to;

/* ---------- Indicateurs ---------- */

export interface ReportKpis {
  routinePct: number | null;
  onTimePct: number | null;
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
  /** Instant de calcul : les routines dont l'échéance n'est pas encore passée ne comptent pas comme en retard */
  now: Date;
}

export function computeKpis(
  source: ReportSource,
  p: Period,
  dims: Dimensions = {},
  opts: KpiOptions = { toleranceMin: 120, now: new Date() },
): ReportKpis {
  const s = scope(source, dims);
  const days = enumerateDays(p.from, p.to);
  let treated = 0;
  let total = 0;
  let due = 0;
  let onTime = 0;
  for (const d of days) {
    const c = dayCompletion(s.templates, s.runs, d);
    treated += c.treated;
    total += c.total;
    for (const t of s.templates.filter((x) => x.active)) {
      const run = findRun(s.runs, t.id, d);
      const deadline = new Date(atTime(d, t.scheduledTime)).getTime() + opts.toleranceMin * 60_000;
      if (deadline > opts.now.getTime() && !run?.completedAt) continue; // pas encore échue
      due += 1;
      if (completedOnTime(t, run, opts.toleranceMin)) onTime += 1;
    }
  }
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
    routinePct: ratio(treated, total),
    onTimePct: ratio(onTime, due),
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
  routinePct: number | null;
  anomalies: number;
  andon: number;
  actionsClosed: number;
  qualityPct: number | null;
}

export function dailySeries(source: ReportSource, p: Period, dims: Dimensions = {}): DailyRow[] {
  const s = scope(source, dims);
  return enumerateDays(p.from, p.to).map((date) => {
    const c = dayCompletion(s.templates, s.runs, date);
    return {
      date,
      routinePct: ratio(c.treated, c.total),
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
    'Routines (% points traités)',
    'Anomalies déclarées',
    'Andon déclenchés',
    'Actions terminées',
    'Conformité LQC (%)',
  ];
  const fmt = (v: number | null) => (v === null ? '' : v.toFixed(1).replace('.', ','));
  return [
    header,
    ...rows.map((r) => [r.date, fmt(r.routinePct), String(r.anomalies), String(r.andon), String(r.actionsClosed), fmt(r.qualityPct)]),
  ]
    .map((cols) => cols.join(';'))
    .join('\r\n');
}

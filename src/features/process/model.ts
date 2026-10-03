import type { Tone } from '@/components/ui/Badge';
import { isOpenAction, isOverdue } from '@/features/actions/model';
import { isOpenAlert } from '@/features/andon/model';
import { countOccurrences, type Occurrence } from '@/features/planning/model';
import { stationView, type StationView } from '@/features/plant/model';
import { PRODUCTION_STAGE, PRODUCTION_STAGES } from '@/features/shared/labels';
import type {
  Action,
  AndonAlert,
  Anomaly,
  DateKey,
  Line,
  MaterialStock,
  Meeting,
  ProductionOrder,
  ProductionStage,
  QualityCheck,
  RoutineTemplate,
  Schedule,
  Workstation,
} from '@/types/domain';

/* Carte du processus : chiffres de chaque étape du travail et flux de fabrication.
   Tout est calculé à partir des données que l'utilisateur a le droit de voir (périmètre appliqué par le serveur). */

export interface Metric {
  label: string;
  value: number;
  /** Ton seulement si la valeur signale un état à traiter */
  tone?: Tone;
}

export interface WorkData {
  today: DateKey;
  now: Date;
  toleranceMin: number;
  routines: RoutineTemplate[];
  schedules: Schedule[];
  occurrencesToday: Occurrence[];
  meetings: Meeting[];
  alerts: AndonAlert[];
  anomalies: Anomaly[];
  checksToday: QualityCheck[];
  actions: Action[];
}

const alertIf = (value: number, tone: Tone): Tone | undefined => (value > 0 ? tone : undefined);

/** Chiffres du moment, par étape du processus de travail */
export function workMetrics(d: WorkData): Record<string, Metric[]> {
  const occ = countOccurrences(d.occurrencesToday, d.today, d.now, d.toleranceMin);
  const openAlerts = d.alerts.filter(isOpenAlert);
  const newAlerts = openAlerts.filter((a) => a.status === 'active');
  const openAnomalies = d.anomalies.filter((a) => a.status !== 'closed');
  const criticalAnomalies = openAnomalies.filter((a) => a.severity === 'critical');
  const outOfTolerance = d.checksToday.filter((c) => c.value < c.min || c.value > c.max);
  const openActions = d.actions.filter(isOpenAction);
  const overdue = d.actions.filter((a) => isOverdue(a, d.today));
  const blocked = d.actions.filter((a) => a.status === 'blocked');
  const meetingsToday = d.meetings.filter((m) => m.date === d.today && m.status !== 'cancelled');

  return {
    standards: [{ label: 'routines actives', value: d.routines.filter((r) => r.active).length }],
    planning: [{ label: 'planifications actives', value: d.schedules.filter((s) => s.status === 'active').length }],
    meetings: [{ label: 'événements aujourd’hui', value: meetingsToday.length }],
    routines: [
      { label: 'prévues aujourd’hui', value: occ.planned },
      { label: 'terminées', value: occ.done },
      { label: 'en cours', value: occ.inProgress },
      { label: 'en retard', value: occ.late, tone: alertIf(occ.late, 'danger') },
    ],
    andon: [
      { label: 'actifs', value: openAlerts.length, tone: alertIf(openAlerts.length, 'warning') },
      { label: 'non pris en charge', value: newAlerts.length, tone: alertIf(newAlerts.length, 'danger') },
    ],
    anomalies: [
      { label: 'ouvertes', value: openAnomalies.length },
      { label: 'critiques', value: criticalAnomalies.length, tone: alertIf(criticalAnomalies.length, 'danger') },
    ],
    quality: [
      { label: 'mesures aujourd’hui', value: d.checksToday.length },
      { label: 'hors tolérance', value: outOfTolerance.length, tone: alertIf(outOfTolerance.length, 'warning') },
    ],
    actions: [
      { label: 'ouvertes', value: openActions.length },
      { label: 'en retard', value: overdue.length, tone: alertIf(overdue.length, 'danger') },
      { label: 'bloquées', value: blocked.length, tone: alertIf(blocked.length, 'warning') },
    ],
  };
}

/* ---------- Flux de fabrication ---------- */

const STAGE_BY_LABEL = new Map(PRODUCTION_STAGES.map((s) => [PRODUCTION_STAGE[s].toLowerCase(), s]));

/** Étape de fabrication d'un poste, d'après son procédé (ex. « Sertissage ») ; null si inconnu */
export function stageOfStation(station: Pick<Workstation, 'process'>): ProductionStage | null {
  return STAGE_BY_LABEL.get(station.process.trim().toLowerCase()) ?? null;
}

export interface FlowStation {
  station: Workstation;
  stage: ProductionStage | null;
  view: StationView;
  /** OF en cours (non terminés) à cette étape sur la ligne */
  ordersHere: number;
  blockedHere: number;
}

export interface LineFlow {
  line: Line;
  stations: FlowStation[];
}

/** Postes de chaque ligne dans l'ordre de fabrication (coupe → … → expédition), avec leur état et leurs OF. */
export function productionFlow(input: {
  lines: Line[];
  workstations: Workstation[];
  orders: ProductionOrder[];
  alerts: AndonAlert[];
  stocks: MaterialStock[];
  anomalies: Anomaly[];
}): LineFlow[] {
  const rank = (s: ProductionStage | null) => (s ? PRODUCTION_STAGES.indexOf(s) : PRODUCTION_STAGES.length);
  return input.lines
    .map((line) => {
      const stations = input.workstations
        .filter((w) => w.active && w.lineId === line.id)
        .map((station) => {
          const stage = stageOfStation(station);
          const here = input.orders.filter((o) => o.lineId === line.id && o.status !== 'done' && stage !== null && o.stage === stage);
          return {
            station,
            stage,
            view: stationView(station, input.alerts, input.stocks, input.anomalies),
            ordersHere: here.length,
            blockedHere: here.filter((o) => o.status === 'blocked').length,
          };
        })
        .sort((a, b) => rank(a.stage) - rank(b.stage) || a.station.code.localeCompare(b.station.code));
      return { line, stations };
    })
    .filter((l) => l.stations.length > 0);
}

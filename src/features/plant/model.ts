import type { Tone } from '@/components/ui/Badge';
import type { AndonAlert, Anomaly, MaterialStock, Workstation } from '@/types/domain';
import { worstOpenAlert } from '@/features/andon/model';
import { isOpenAnomaly } from '@/features/anomalies/model';
import { needsReorder } from '@/features/production/model';

/* État d'un poste sur le plan : UNIQUEMENT calculé à partir de données saisies.
   Aucune donnée machine n'est simulée (docs/decisions.md). */

export type StationState = 'andon' | 'andon_ack' | 'attention' | 'ok';

export const STATION_STATE: Record<StationState, { label: string; tone: Tone }> = {
  andon: { label: 'Andon en attente', tone: 'danger' },
  andon_ack: { label: 'Andon pris en charge', tone: 'warning' },
  attention: { label: 'À surveiller', tone: 'warning' },
  ok: { label: 'Aucun signal', tone: 'success' },
};

export type DataOrigin = 'computed' | 'manual' | 'not_connected';

export const DATA_ORIGIN: Record<DataOrigin, string> = {
  computed: 'Calculé à partir des saisies',
  manual: 'Saisie manuelle',
  not_connected: 'Non connecté',
};

export interface StationSignal {
  label: string;
  origin: DataOrigin;
  source: string;
  tone: Tone;
}

export interface StationView {
  station: Workstation;
  state: StationState;
  signals: StationSignal[];
  alert?: AndonAlert;
  lowStocks: MaterialStock[];
  openAnomalies: Anomaly[];
}

export function stationView(station: Workstation, alerts: AndonAlert[], stocks: MaterialStock[], anomalies: Anomaly[]): StationView {
  const alert = worstOpenAlert(alerts, station.id);
  const lowStocks = stocks.filter((s) => s.workstationId === station.id && needsReorder(s));
  const openAnomalies = anomalies.filter((a) => a.workstationId === station.id && isOpenAnomaly(a));
  const critical = openAnomalies.filter((a) => a.severity === 'critical');

  const signals: StationSignal[] = [];
  if (alert)
    signals.push({
      label: `Andon ${alert.status === 'active' ? 'en attente' : 'pris en charge'} : ${alert.detail}`,
      origin: 'computed',
      source: 'Andon',
      tone: alert.status === 'active' ? 'danger' : 'warning',
    });
  if (lowStocks.length)
    signals.push({
      label: `${lowStocks.length} matière(s) sous le minimum : ${lowStocks.map((s) => s.material).join(', ')}`,
      origin: 'computed',
      source: 'Stocks',
      tone: 'warning',
    });
  if (critical.length)
    signals.push({
      label: `${critical.length} anomalie(s) critique(s) ouverte(s)`,
      origin: 'computed',
      source: 'Anomalies',
      tone: 'danger',
    });

  const state: StationState = alert
    ? alert.status === 'active'
      ? 'andon'
      : 'andon_ack'
    : lowStocks.length || critical.length
      ? 'attention'
      : 'ok';
  return { station, state, signals, alert, lowStocks, openAnomalies };
}

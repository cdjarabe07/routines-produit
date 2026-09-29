import type { Tone } from '@/components/ui/Badge';
import type { AndonAlert, AndonStatus, AndonType, ID } from '@/types/domain';
import { minutesBetween } from '@/utils/date';

export const ANDON_TYPE: Record<AndonType, { label: string; defaultUrgency: 'normal' | 'critical' }> = {
  quality: { label: 'Qualité', defaultUrgency: 'normal' },
  equipment: { label: 'Équipement', defaultUrgency: 'normal' },
  material: { label: 'Matière', defaultUrgency: 'normal' },
  safety: { label: 'Sécurité', defaultUrgency: 'critical' },
};

export const ANDON_STATUS: Record<AndonStatus, { label: string; tone: Tone }> = {
  active: { label: 'En attente', tone: 'danger' },
  acknowledged: { label: 'Pris en charge', tone: 'warning' },
  resolved: { label: 'Résolu', tone: 'success' },
};

export const ANDON_PRESETS: Record<AndonType, string[]> = {
  quality: ['Connecteur mal serti', 'Défaut de rubanage', 'Longueur hors tolérance', 'Contact plié ou manquant'],
  equipment: ['Presse de sertissage à l’arrêt', 'Testeur de continuité en panne', 'Machine de coupe bloquée', 'Bruit anormal'],
  material: ['Rupture de terminaux', 'Connecteurs manquants', 'Ruban épuisé', 'Mauvaise référence livrée'],
  safety: ['Situation dangereuse', 'Blessure légère', 'Protection machine absente'],
};

export const isOpenAlert = (a: AndonAlert) => a.status !== 'resolved';

/** Escaladé = toujours en attente de prise en charge au-delà du seuil. */
export const isEscalated = (a: AndonAlert, now: Date, thresholdMin: number) =>
  a.status === 'active' && minutesBetween(a.raisedAt, now) >= thresholdMin;

export const acknowledgeMinutes = (a: AndonAlert) => (a.acknowledgedAt ? minutesBetween(a.raisedAt, a.acknowledgedAt) : null);

export const resolutionMinutes = (a: AndonAlert) => (a.resolvedAt ? minutesBetween(a.raisedAt, a.resolvedAt) : null);

/** Alerte ouverte la plus grave d'un poste (sécurité et escalade d'abord). */
export function worstOpenAlert(alerts: AndonAlert[], workstationId: ID): AndonAlert | undefined {
  return alerts
    .filter((a) => a.workstationId === workstationId && isOpenAlert(a))
    .sort((a, b) => {
      const u = (a.urgency === 'critical' ? 0 : 1) - (b.urgency === 'critical' ? 0 : 1);
      if (u !== 0) return u;
      const s = (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1);
      if (s !== 0) return s;
      return a.raisedAt.localeCompare(b.raisedAt);
    })[0];
}

const average = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);

export function andonStats(alerts: AndonAlert[]) {
  const resolved = alerts.filter((a) => a.status === 'resolved');
  return {
    count: alerts.length,
    avgAcknowledgeMin: average(alerts.map(acknowledgeMinutes).filter((v): v is number => v !== null)),
    avgResolutionMin: average(resolved.map(resolutionMinutes).filter((v): v is number => v !== null)),
  };
}

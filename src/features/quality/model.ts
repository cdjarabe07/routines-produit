import type { DateKey, QualityCheck } from '@/types/domain';
import { dateKeyOf } from '@/utils/date';
import { ratio } from '@/utils/format';

export const isConform = (c: Pick<QualityCheck, 'value' | 'min' | 'max'>) => c.value >= c.min && c.value <= c.max;

/** Conformité = mesures dans les bornes / mesures de la période (null si aucune mesure). */
export function conformity(checks: QualityCheck[]): number | null {
  return ratio(checks.filter(isConform).length, checks.length);
}

export const checksOn = (checks: QualityCheck[], day: DateKey) => checks.filter((c) => dateKeyOf(c.createdAt) === day);

/** Position de la mesure dans la tolérance, en % (0 = min, 100 = max). Sert à la jauge. */
export function positionInTolerance(c: Pick<QualityCheck, 'value' | 'min' | 'max'>): number {
  const span = c.max - c.min;
  if (span <= 0) return 50;
  return ((c.value - c.min) / span) * 100;
}

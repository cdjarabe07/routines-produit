import { useOperation } from '@/hooks/useData';
import type { NewEntity } from '@/services/data/types';
import type { ID, QualityCheck } from '@/types/domain';

export function useRecordCheck() {
  return useOperation((ds, input: NewEntity<QualityCheck>) => ds.repo('qualityChecks').create(input), {
    invalidates: ['qualityChecks'],
    success: (c) => (c.value >= c.min && c.value <= c.max ? 'Mesure conforme enregistrée.' : 'Mesure HORS TOLÉRANCE enregistrée.'),
  });
}

export function useLinkCheckAnomaly() {
  return useOperation((ds, { checkId, anomalyId }: { checkId: ID; anomalyId: ID }) => ds.repo('qualityChecks').update(checkId, { anomalyId }), {
    invalidates: ['qualityChecks'],
  });
}

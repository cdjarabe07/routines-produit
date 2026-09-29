import type { Anomaly } from '@/types/domain';
import { SEVERITY } from '@/features/shared/labels';

export const isOpenAnomaly = (a: Anomaly) => a.status !== 'closed';

/** Tri : ouvertes d'abord, gravité, puis plus récentes. */
export function sortAnomalies(list: Anomaly[]): Anomaly[] {
  return [...list].sort((a, b) => {
    const open = (isOpenAnomaly(a) ? 0 : 1) - (isOpenAnomaly(b) ? 0 : 1);
    if (open !== 0) return open;
    const sev = SEVERITY[a.severity].rank - SEVERITY[b.severity].rank;
    if (sev !== 0) return sev;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

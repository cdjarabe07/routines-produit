import { useOperation } from '@/hooks/useData';
import { notify } from '@/features/notifications/api';
import type { DataSource, NewEntity } from '@/services/data/types';
import type { Anomaly, AnomalyStatus, ID, User } from '@/types/domain';
import { ANOMALY_CATEGORY } from '@/features/shared/labels';
import { truncate } from '@/utils/format';

export type AnomalyInput = Pick<Anomaly, 'description' | 'category' | 'severity' | 'workstationId' | 'photo' | 'origin'>;

/** Crée une anomalie et prévient l'encadrement (Line Leaders) si elle est critique. */
export async function createAnomaly(ds: DataSource, input: AnomalyInput, reporter: User): Promise<Anomaly> {
  const payload: NewEntity<Anomaly> = { ...input, status: 'open', reportedBy: reporter.id };
  const anomaly = await ds.repo('anomalies').create(payload);
  if (input.severity === 'critical') {
    const leaders = (await ds.repo('users').list()).filter((u) => u.active && (u.role === 'line_leader' || u.role === 'manager'));
    await notify(
      ds,
      leaders.map((u) => u.id),
      { kind: 'anomaly_reported', title: `Anomalie critique (${ANOMALY_CATEGORY[input.category]}) : ${truncate(input.description, 70)}`, link: `/anomalies/${anomaly.id}` },
      reporter.id,
    );
  }
  return anomaly;
}

export function useCreateAnomaly() {
  return useOperation((ds, { input, reporter }: { input: AnomalyInput; reporter: User }) => createAnomaly(ds, input, reporter), {
    invalidates: ['anomalies', 'notifications'],
    success: 'Anomalie enregistrée.',
  });
}

export function useUpdateAnomalyStatus() {
  return useOperation(
    async (ds, { id, status, by, resolutionNote }: { id: ID; status: AnomalyStatus; by: ID; resolutionNote?: string }) =>
      ds.repo('anomalies').update(id, {
        status,
        ...(status === 'closed'
          ? { closedAt: new Date().toISOString(), closedBy: by, resolutionNote }
          : { closedAt: undefined, closedBy: undefined }),
      }),
    {
      invalidates: ['anomalies'],
      success: (a) => (a.status === 'closed' ? 'Anomalie clôturée.' : a.status === 'in_progress' ? 'Anomalie en traitement.' : 'Anomalie rouverte.'),
    },
  );
}

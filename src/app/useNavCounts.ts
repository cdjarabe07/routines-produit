import { useMemo } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { isDueToday, isOverdue } from '@/features/actions/model';
import { isOpenAlert } from '@/features/andon/model';
import { usePlanningData } from '@/features/planning/api';
import { isAssignedTo, occurrenceState, occurrencesBetween } from '@/features/planning/model';
import { useSettings } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useNow } from '@/hooks/useNow';
import { todayKey } from '@/utils/date';
import type { NavCountKey } from './navigation';

/** Compteurs du menu : ce qui attend une action de l'utilisateur connecté. */
export function useNavCounts(): Partial<Record<NavCountKey, { value: number; urgent: boolean }>> {
  const { user } = useAuth();
  const now = useNow(60_000);
  const { settings } = useSettings();
  const planning = usePlanningData();
  const actions = useCollection('actions');
  const alerts = useCollection('andonAlerts');
  const anomalies = useCollection('anomalies');
  const handovers = useCollection('handovers');

  return useMemo(() => {
    if (!user) return {};
    const today = todayKey();
    const mine = (actions.data ?? []).filter((a) => a.assigneeId === user.id || a.backupId === user.id);
    const overdue = mine.filter((a) => isOverdue(a, today)).length;
    const dueToday = mine.filter((a) => isDueToday(a, today)).length;

    const routineStates = planning.source
      ? occurrencesBetween(planning.source, today, today, (s) => isAssignedTo(s, user)).map((o) =>
          occurrenceState(o, today, now, settings.routineLateToleranceMinutes),
        )
      : [];
    const openAlerts = (alerts.data ?? []).filter(isOpenAlert);
    const since = now.getTime() - 24 * 3_600_000;
    const pendingHandovers = (handovers.data ?? []).filter(
      (h) => !h.acknowledgedAt && user.shift && h.toShift === user.shift && new Date(h.createdAt).getTime() > since,
    ).length;

    return {
      routines: {
        value: routineStates.filter((s) => s === 'due' || s === 'late' || s === 'in_progress').length,
        urgent: routineStates.includes('late'),
      },
      actions: { value: overdue + dueToday, urgent: overdue > 0 },
      andon: { value: openAlerts.length, urgent: openAlerts.some((a) => a.status === 'active') },
      anomalies: { value: (anomalies.data ?? []).filter((a) => a.status === 'open').length, urgent: false },
      handover: { value: pendingHandovers, urgent: false },
    };
  }, [user, actions.data, alerts.data, anomalies.data, planning.source, handovers.data, now, settings.routineLateToleranceMinutes]);
}

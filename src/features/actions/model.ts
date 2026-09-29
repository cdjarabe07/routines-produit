import type { Action, DateKey, ID, Priority, Severity } from '@/types/domain';
import { addDays } from '@/utils/date';
import { PRIORITY } from '@/features/shared/labels';

export const isOpenAction = (a: Action) => a.status === 'todo' || a.status === 'in_progress';

/** Modifier le statut d'une action : responsable, suppléant, créateur, ou droit « action.manage ». */
export const canUpdateAction = (a: Action, userId: ID, canManage: boolean) =>
  canManage || a.assigneeId === userId || a.backupId === userId || a.createdBy === userId;

/** Lien vers l'origine d'une action (null si saisie manuelle). */
export function sourceLink(a: Action): string | null {
  if (!a.source.id) return null;
  switch (a.source.type) {
    case 'anomaly':
      return `/anomalies/${a.source.id}`;
    case 'gemba':
      return `/gemba/${a.source.id}`;
    case 'meeting':
      return `/reunions/${a.source.id}`;
    default:
      return null;
  }
}

/** En retard = ouverte et échéance strictement passée (calculé, jamais stocké). */
export const isOverdue = (a: Action, today: DateKey) => isOpenAction(a) && a.dueDate < today;

export const isDueToday = (a: Action, today: DateKey) => isOpenAction(a) && a.dueDate === today;

export type ActionView = 'mine' | 'all' | 'overdue' | 'closed';

export function filterActions(actions: Action[], view: ActionView, userId: ID, today: DateKey): Action[] {
  switch (view) {
    case 'mine':
      return actions.filter((a) => isOpenAction(a) && (a.assigneeId === userId || a.backupId === userId));
    case 'overdue':
      return actions.filter((a) => isOverdue(a, today));
    case 'closed':
      return actions.filter((a) => !isOpenAction(a));
    default:
      return actions.filter(isOpenAction);
  }
}

/** Tri opérationnel : retard d'abord, puis priorité, puis échéance. */
export function sortActions(actions: Action[], today: DateKey): Action[] {
  return [...actions].sort((a, b) => {
    const lateA = isOverdue(a, today) ? 0 : 1;
    const lateB = isOverdue(b, today) ? 0 : 1;
    if (lateA !== lateB) return lateA - lateB;
    const prio = PRIORITY[a.priority].rank - PRIORITY[b.priority].rank;
    if (prio !== 0) return prio;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

/** Règles héritées du prototype (Gemba) : délai et priorité selon la gravité. */
export const DUE_DAYS_BY_SEVERITY: Record<Severity, number> = { critical: 1, major: 3, minor: 7 };
export const PRIORITY_BY_SEVERITY: Record<Severity, Priority> = { critical: 'critical', major: 'high', minor: 'medium' };

export const defaultDueDate = (severity: Severity, from: DateKey) => addDays(from, DUE_DAYS_BY_SEVERITY[severity]);

/** Délai de clôture en jours (null si non clôturée). */
export function closureDays(a: Action): number | null {
  if (a.status !== 'done' || !a.closedAt) return null;
  return Math.max(0, (new Date(a.closedAt).getTime() - new Date(a.createdAt).getTime()) / 86_400_000);
}

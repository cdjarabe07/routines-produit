import { Badge } from '@/components/ui/Badge';
import { ACTION_STATUS, PRIORITY } from '@/features/shared/labels';
import type { Action, DateKey } from '@/types/domain';
import { formatDate } from '@/utils/date';
import { isOverdue } from '../model';

export function ActionStatusBadge({ action, today }: { action: Action; today: DateKey }) {
  if (isOverdue(action, today)) return <Badge tone="danger">En retard</Badge>;
  const s = ACTION_STATUS[action.status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function PriorityBadge({ action }: { action: Action }) {
  const p = PRIORITY[action.priority];
  return <Badge tone={p.tone}>{p.label}</Badge>;
}

/** Échéance, en rouge si dépassée, « Aujourd'hui » si le jour même. */
export function DueDate({ action, today }: { action: Action; today: DateKey }) {
  const late = isOverdue(action, today);
  const label = action.dueDate === today ? 'Aujourd’hui' : formatDate(action.dueDate);
  return (
    <span style={{ color: late ? 'var(--color-danger)' : undefined, fontWeight: late ? 600 : undefined, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

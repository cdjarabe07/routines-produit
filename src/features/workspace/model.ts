import type { Tone } from '@/components/ui/Badge';
import { isOpenAction, isOverdue } from '@/features/actions/model';
import { MEETING_STATUS, meetingsForUser } from '@/features/meetings/model';
import {
  OCCURRENCE_STATE,
  isAssignedTo,
  occurrenceState,
  occurrencesBetween,
  type Occurrence,
  type OccurrenceSource,
  type OccurrenceState,
} from '@/features/planning/model';
import { EVENT_TYPE } from '@/features/shared/labels';
import type { Action, DateKey, Meeting, User } from '@/types/domain';
import { formatDate } from '@/utils/date';

/* Espace « Mon travail » : ce qui est affecté à la personne connectée. */

export interface MyOccurrence extends Occurrence {
  state: OccurrenceState;
}

/** Occurrences affectées à la personne (directement ou via son équipe) sur une période. */
export function myOccurrences(
  src: OccurrenceSource,
  user: User,
  from: DateKey,
  to: DateKey,
  today: DateKey,
  now: Date,
  toleranceMin: number,
): MyOccurrence[] {
  return occurrencesBetween(src, from, to, (s) => isAssignedTo(s, user)).map((o) => ({
    ...o,
    state: occurrenceState(o, today, now, toleranceMin),
  }));
}

/** Priorité d'affichage « maintenant » : en cours, en retard, à faire, puis à venir. */
const NOW_ORDER: Record<OccurrenceState, number> = { in_progress: 0, late: 1, due: 2, upcoming: 3, done: 4, missed: 5 };

export function currentAndNext(today: MyOccurrence[]) {
  const active = today.filter((o) => o.state === 'in_progress' || o.state === 'late' || o.state === 'due');
  const current = [...active].sort((a, b) => NOW_ORDER[a.state] - NOW_ORDER[b.state] || a.time.localeCompare(b.time))[0];
  const next = today.filter((o) => o.state === 'upcoming').sort((a, b) => a.time.localeCompare(b.time))[0];
  return { current, next };
}

export type PlanningKind = 'routine' | 'event' | 'action';

export interface PlanningEntry {
  id: string;
  date: DateKey;
  /** Heure de début (absente pour une échéance d'action) */
  time?: string;
  endTime?: string;
  kind: PlanningKind;
  kindLabel: string;
  title: string;
  detail?: string;
  state: { label: string; tone: Tone };
  to: string;
}

/** Planning personnel : routines affectées, événements où la personne est invitée, actions à échéance. */
export function buildPlanning(args: {
  occurrences: MyOccurrence[];
  meetings: Meeting[];
  actions: Action[];
  user: User;
  from: DateKey;
  to: DateKey;
  today: DateKey;
}): PlanningEntry[] {
  const { occurrences, meetings, actions, user, from, to, today } = args;
  const entries: PlanningEntry[] = [
    ...occurrences.map((o): PlanningEntry => ({
      id: `r-${o.key}`,
      date: o.date,
      time: o.time,
      kind: 'routine',
      kindLabel: 'Routine',
      title: o.routine.title,
      detail: `${o.routine.durationMin} min · ${o.routine.tasks.length} tâche(s)`,
      state: OCCURRENCE_STATE[o.state],
      to: `/app/routines/${o.schedule.id}/${o.date}`,
    })),
    ...meetingsForUser(meetings, user)
      .filter((m) => m.date >= from && m.date <= to)
      .map((m): PlanningEntry => ({
        id: `m-${m.id}`,
        date: m.date,
        time: m.startTime,
        endTime: m.endTime,
        kind: 'event',
        kindLabel: EVENT_TYPE[m.type],
        title: m.title,
        detail: [m.location, m.organizerId === user.id ? 'Vous êtes responsable' : null].filter(Boolean).join(' · ') || undefined,
        state: MEETING_STATUS[m.status],
        to: `/reunions/${m.id}`,
      })),
    ...actions
      .filter((a) => isOpenAction(a) && (a.assigneeId === user.id || a.backupId === user.id))
      .filter((a) => (a.dueDate >= from && a.dueDate <= to) || (from <= today && today <= to && isOverdue(a, today)))
      .map((a): PlanningEntry => ({
        id: `a-${a.id}`,
        // Une action en retard apparaît aujourd'hui pour rester visible
        date: isOverdue(a, today) ? today : a.dueDate,
        kind: 'action',
        kindLabel: 'Action',
        title: a.title,
        detail: isOverdue(a, today) ? `Échéance dépassée (${formatDate(a.dueDate)})` : 'Échéance du jour',
        state: isOverdue(a, today)
          ? { label: 'En retard', tone: 'danger' }
          : a.status === 'blocked'
            ? { label: 'Bloquée', tone: 'danger' }
            : { label: 'À traiter', tone: 'warning' },
        to: `/actions/${a.id}`,
      })),
  ];
  return entries.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'));
}

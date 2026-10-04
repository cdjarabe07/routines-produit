import type { Tone } from '@/components/ui/Badge';
import type { DateKey, ID, Recurrence, RoutineRun, RoutineTemplate, Schedule, TimeOfDay, User } from '@/types/domain';
import { addDays, dateKeyOf, enumerateDays, isoWeekday, minutesOfDay, timeToMinutes } from '@/utils/date';

/* Planification → occurrences.
   Une occurrence = une planification à une date. Elle est CALCULÉE, jamais stockée :
   modifier une planification met à jour toutes ses occurrences futures. */

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  once: 'Une seule fois',
  daily: 'Tous les jours',
  weekdays: 'Du lundi au vendredi',
  weekly: 'Certains jours de la semaine',
  monthly: 'Chaque mois',
};

export const WEEKDAY_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

export function describeRecurrence(
  s: Pick<Schedule, 'recurrence' | 'weekdays' | 'startDate' | 'endDate'> & Partial<Pick<Schedule, 'time' | 'everyHours' | 'endTime'>>,
): string {
  let base: string;
  if (s.recurrence === 'weekly') {
    const days = [...s.weekdays].sort().map((d) => WEEKDAY_SHORT[d - 1]);
    base = days.length ? `Chaque ${days.join(', ')}` : 'Aucun jour choisi';
  } else if (s.recurrence === 'monthly') {
    base = `Chaque mois, le ${Number(s.startDate.slice(8))}`;
  } else base = RECURRENCE_LABELS[s.recurrence];
  return s.everyHours && s.endTime && s.time ? `${base} · toutes les ${s.everyHours} h de ${s.time} à ${s.endTime}` : base;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Créneaux d'une journée : l'heure prévue, puis toutes les N heures jusqu'à l'heure de fin (incluse) */
export function slotsOf(s: Pick<Schedule, 'time' | 'everyHours' | 'endTime'>): TimeOfDay[] {
  if (!s.everyHours || !s.endTime || s.everyHours < 1) return [s.time];
  const out: TimeOfDay[] = [];
  const end = timeToMinutes(s.endTime);
  for (let m = timeToMinutes(s.time); m <= end && m < 24 * 60 && out.length < 24; m += s.everyHours * 60) {
    out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  }
  return out.length ? out : [s.time];
}

/** Planification répétée dans la journée */
export const isMultiSlot = (s: Pick<Schedule, 'time' | 'everyHours' | 'endTime'>) => slotsOf(s).length > 1;

/** Adresse d'une occurrence (le créneau n'apparaît que pour une planification répétée dans la journée) */
export function occurrencePath(o: {
  schedule: Pick<Schedule, 'id' | 'time' | 'everyHours' | 'endTime'>;
  date: DateKey;
  time: TimeOfDay;
}): string {
  const base = `/app/routines/${o.schedule.id}/${o.date}`;
  return isMultiSlot(o.schedule) ? `${base}/${o.time.replace(':', '')}` : base;
}

/** Créneau lu dans l'adresse (« 0730 » → « 07:30 ») */
export const slotFromParam = (param?: string): TimeOfDay | undefined =>
  param && /^\d{4}$/.test(param) ? `${param.slice(0, 2)}:${param.slice(2)}` : undefined;

/** La planification produit-elle une occurrence à cette date ? (hors annulations) */
export function occursOn(s: Schedule, date: DateKey): boolean {
  if (s.status !== 'active' || date < s.startDate || (s.endDate && date > s.endDate)) return false;
  switch (s.recurrence) {
    case 'once':
      return date === s.startDate;
    case 'daily':
      return true;
    case 'weekdays':
      return isoWeekday(date) <= 5;
    case 'weekly':
      return s.weekdays.includes(isoWeekday(date));
    case 'monthly': {
      // Même jour du mois que le début ; dernier jour du mois s'il est plus court (31 → 30, 28 ou 29)
      const day = Number(s.startDate.slice(8));
      const lastDay = Number(addDays(`${addDays(date.slice(0, 8) + '28', 4).slice(0, 8)}01`, -1).slice(8));
      return Number(date.slice(8)) === Math.min(day, lastDay);
    }
  }
}

/** Affectée à la personne, directement ou via son équipe. */
export const isAssignedTo = (s: Pick<Schedule, 'assigneeId' | 'teamId'>, user: Pick<User, 'id' | 'teamId'>) =>
  s.assigneeId === user.id || Boolean(s.teamId && user.teamId === s.teamId);

/** Clé d'une occurrence : planification, date et créneau (vide pour une planification à créneau unique) */
const occurrenceKey = (scheduleId: ID, date: DateKey, slot = '') => `${scheduleId}~${date}~${slot}`;

export interface Occurrence {
  key: string;
  schedule: Schedule;
  routine: RoutineTemplate;
  date: DateKey;
  time: TimeOfDay;
  run?: RoutineRun;
}

export interface OccurrenceSource {
  schedules: Schedule[];
  routines: RoutineTemplate[];
  runs: RoutineRun[];
}

/** Occurrences d'une période, triées par date puis heure. Les occurrences annulées sont exclues. */
export function occurrencesBetween(src: OccurrenceSource, from: DateKey, to: DateKey, filter?: (s: Schedule) => boolean): Occurrence[] {
  const routineById = new Map(src.routines.map((r) => [r.id, r]));
  const runByKey = new Map(src.runs.map((r) => [occurrenceKey(r.scheduleId, r.date, r.slot), r]));
  const schedules = src.schedules.filter((s) => routineById.has(s.routineId) && (!filter || filter(s)));
  const out: Occurrence[] = [];
  for (const date of enumerateDays(from, to)) {
    for (const s of schedules) {
      if (!occursOn(s, date) || s.skippedDates.includes(date)) continue;
      const multi = isMultiSlot(s);
      for (const time of slotsOf(s)) {
        const key = occurrenceKey(s.id, date, multi ? time : '');
        out.push({ key, schedule: s, routine: routineById.get(s.routineId)!, date, time, run: runByKey.get(key) });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

/** Occurrence précise (null si la planification ne tombe pas ce jour-là, à ce créneau, ou est annulée). */
export function findOccurrence(src: OccurrenceSource, scheduleId: ID, date: DateKey, slot?: TimeOfDay): Occurrence | null {
  const list = occurrencesBetween(src, date, date, (s) => s.id === scheduleId);
  return (slot ? list.find((o) => o.time === slot) : list[0]) ?? null;
}

export type OccurrenceState = 'upcoming' | 'due' | 'in_progress' | 'late' | 'done' | 'missed';

export const OCCURRENCE_STATE: Record<OccurrenceState, { label: string; tone: Tone }> = {
  upcoming: { label: 'À venir', tone: 'neutral' },
  due: { label: 'À faire', tone: 'warning' },
  in_progress: { label: 'En cours', tone: 'info' },
  late: { label: 'En retard', tone: 'danger' },
  done: { label: 'Terminée', tone: 'success' },
  missed: { label: 'Non réalisée', tone: 'danger' },
};

/**
 * État d'une occurrence :
 * - done : exécution terminée ;
 * - missed : jour passé sans exécution terminée ;
 * - in_progress : démarrée aujourd'hui, pas terminée ;
 * - upcoming : jour futur, ou avant l'heure prévue ;
 * - late : heure prévue + tolérance dépassée sans démarrage ;
 * - due : heure prévue passée, dans la tolérance.
 */
export function occurrenceState(
  o: Pick<Occurrence, 'date' | 'time' | 'run'> & { schedule?: Pick<Schedule, 'everyHours' | 'endTime' | 'time'> },
  today: DateKey,
  now: Date,
  toleranceMin: number,
): OccurrenceState {
  // Contrôles répétés : en retard au plus tard à mi-intervalle (un contrôle horaire n'attend pas 2 h)
  if (o.schedule && isMultiSlot(o.schedule) && o.schedule.everyHours) toleranceMin = Math.min(toleranceMin, o.schedule.everyHours * 30);
  if (o.run?.completedAt) return 'done';
  if (o.date < today) return 'missed';
  if (o.date > today) return 'upcoming';
  if (o.run) return 'in_progress';
  const elapsed = minutesOfDay(now) - timeToMinutes(o.time);
  if (elapsed < 0) return 'upcoming';
  return elapsed > toleranceMin ? 'late' : 'due';
}

/** Terminée à l'heure : clôture au plus tard à l'heure prévue + durée + tolérance. */
export function completedOnTime(o: Pick<Occurrence, 'date' | 'time' | 'run' | 'routine'>, toleranceMin: number): boolean {
  if (!o.run?.completedAt) return false;
  // Jour et heure de clôture lus dans le fuseau de l'atelier
  const sameDay = dateKeyOf(o.run.completedAt) === o.date;
  return sameDay && minutesOfDay(new Date(o.run.completedAt)) <= timeToMinutes(o.time) + o.routine.durationMin + toleranceMin;
}

export interface OccurrenceCounts {
  planned: number;
  done: number;
  inProgress: number;
  late: number;
  missed: number;
  upcoming: number;
  /** Échues : ce qui aurait dû être commencé à l'instant du calcul */
  due: number;
}

export function countOccurrences(list: Occurrence[], today: DateKey, now: Date, toleranceMin: number): OccurrenceCounts {
  const c: OccurrenceCounts = { planned: list.length, done: 0, inProgress: 0, late: 0, missed: 0, upcoming: 0, due: 0 };
  for (const o of list) {
    const s = occurrenceState(o, today, now, toleranceMin);
    if (s === 'done') c.done += 1;
    else if (s === 'in_progress') c.inProgress += 1;
    else if (s === 'late') c.late += 1;
    else if (s === 'missed') c.missed += 1;
    else if (s === 'upcoming') c.upcoming += 1;
    else c.due += 1;
  }
  return c;
}

/** Prochaines dates d'une planification (aperçu dans le formulaire). */
export function nextDates(s: Schedule, from: DateKey, count: number, horizonDays = 120): DateKey[] {
  const out: DateKey[] = [];
  for (let d = from, i = 0; i < horizonDays && out.length < count; d = addDays(d, 1), i++) {
    if (occursOn(s, d) && !s.skippedDates.includes(d)) out.push(d);
  }
  return out;
}

/** Libellé d'affectation d'une planification. */
export function assignmentLabel(
  s: Pick<Schedule, 'assigneeId' | 'teamId'>,
  userName: (id?: string) => string,
  teamName: (id?: string) => string,
) {
  if (s.assigneeId) return userName(s.assigneeId);
  if (s.teamId) return teamName(s.teamId);
  return 'Non affectée';
}

import type { DateKey, Meeting } from '@/types/domain';
import { addDays, enumerateDays, startOfMonth, startOfWeek, timeToMinutes } from '@/utils/date';

/* Calendrier de l'agenda : périodes affichées, placement des événements sur l'axe horaire. */

export type CalendarView = 'day' | 'week' | 'month';

/** Jours couverts par la vue (le mois est complété en semaines entières, du lundi au dimanche) */
export function periodDays(view: CalendarView, anchor: DateKey): DateKey[] {
  if (view === 'day') return [anchor];
  if (view === 'week') {
    const start = startOfWeek(anchor);
    return enumerateDays(start, addDays(start, 6));
  }
  const first = startOfMonth(anchor);
  const nextMonth = startOfMonth(addDays(first, 31));
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(addDays(nextMonth, -1)), 6);
  return enumerateDays(start, end);
}

/** Même position dans la période précédente (-1) ou suivante (+1) */
export function shiftAnchor(view: CalendarView, anchor: DateKey, direction: -1 | 1): DateKey {
  if (view === 'day') return addDays(anchor, direction);
  if (view === 'week') return addDays(anchor, 7 * direction);
  const first = startOfMonth(anchor);
  return direction === 1 ? startOfMonth(addDays(first, 31)) : startOfMonth(addDays(first, -1));
}

export interface PlacedEvent {
  meeting: Meeting;
  start: number;
  end: number;
  /** Colonne occupée et nombre de colonnes du groupe d'événements simultanés */
  column: number;
  columns: number;
}

const MIN_DURATION = 25;

/** Place les événements d'une journée : ceux qui se chevauchent sont mis côte à côte. */
export function layoutDay(meetings: Meeting[]): PlacedEvent[] {
  const items = meetings
    .map((meeting) => {
      const start = timeToMinutes(meeting.startTime);
      // Durée minimale pour rester lisible et cliquable (une ligne de texte)
      return { meeting, start, end: Math.max(timeToMinutes(meeting.endTime), start + MIN_DURATION) };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const placed: PlacedEvent[] = [];
  let group: PlacedEvent[] = [];
  let groupEnd = -1;
  const closeGroup = () => {
    const columns = Math.max(0, ...group.map((p) => p.column + 1));
    for (const p of group) p.columns = columns;
    placed.push(...group);
    group = [];
  };

  for (const item of items) {
    if (item.start >= groupEnd) closeGroup();
    // Première colonne libre à cette heure
    const busy = new Set(group.filter((p) => p.end > item.start).map((p) => p.column));
    let column = 0;
    while (busy.has(column)) column++;
    group.push({ ...item, column, columns: 1 });
    groupEnd = Math.max(groupEnd, item.end);
  }
  closeGroup();
  return placed;
}

/** Plage horaire affichée : 6 h – 20 h, élargie pour contenir tous les événements (heures entières) */
export function hourRange(meetings: Meeting[], defaults: [number, number] = [6, 20]): [number, number] {
  let [from, to] = defaults;
  for (const m of meetings) {
    from = Math.min(from, Math.floor(timeToMinutes(m.startTime) / 60));
    to = Math.max(to, Math.ceil(timeToMinutes(m.endTime) / 60));
  }
  return [Math.max(0, from), Math.min(24, to)];
}

/** Heure arrondie à la demi-heure inférieure, au format HH:MM */
export function slotTime(minutes: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 30, Math.floor(minutes / 30) * 30));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

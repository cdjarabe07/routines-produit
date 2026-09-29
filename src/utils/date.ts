import type { DateKey, ISODateTime, TimeOfDay } from '@/types/domain';

/* Toutes les dates « calendaires » sont en heure locale de l'atelier.
   Le prototype mélangeait UTC et local (décalage d'un jour autour de minuit). */

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(date: Date = new Date()): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayKey = (): DateKey => toDateKey(new Date());

export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / 86_400_000);
}

export function dateKeyOf(iso: ISODateTime): DateKey {
  return toDateKey(new Date(iso));
}

export function enumerateDays(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
export function isoWeekday(key: DateKey): number {
  const d = parseDateKey(key).getDay();
  return d === 0 ? 7 : d;
}

/** Lundi de la semaine contenant la date. */
export const startOfWeek = (key: DateKey): DateKey => addDays(key, 1 - isoWeekday(key));

export function timeToMinutes(time: TimeOfDay): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesOfDay(date: Date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Construit un horodatage ISO à partir d'une date locale et d'une heure HH:mm. */
export function atTime(key: DateKey, time: TimeOfDay): ISODateTime {
  const d = parseDateKey(key);
  const mins = timeToMinutes(time);
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d.toISOString();
}

export function minutesBetween(fromIso: ISODateTime, to: Date | ISODateTime = new Date()): number {
  const end = typeof to === 'string' ? new Date(to) : to;
  return Math.max(0, Math.floor((end.getTime() - new Date(fromIso).getTime()) / 60_000));
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const shortDateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' });
const longDateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

const asDate = (v: DateKey | ISODateTime | Date) => (v instanceof Date ? v : v.length === 10 ? parseDateKey(v) : new Date(v));

export const formatDate = (v: DateKey | ISODateTime | Date) => dateFmt.format(asDate(v));
export const formatShortDate = (v: DateKey | ISODateTime | Date) => shortDateFmt.format(asDate(v));
export const formatLongDate = (v: DateKey | ISODateTime | Date) => longDateFmt.format(asDate(v));
export const formatTime = (v: ISODateTime | Date) => timeFmt.format(asDate(v));
export const formatDateTime = (v: ISODateTime | Date) => `${formatDate(v)} ${formatTime(v)}`;

/** Durée lisible : « 04:12 » sous une heure, « 1 h 05 » au-delà. */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h} h ${pad(m)}` : `${pad(m)}:${pad(s)}`;
}

/** Durée en minutes lisible : « 7 min », « 1 h 20 », « 2 j 3 h ». */
export function formatMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${pad(m % 60)}`;
  return `${Math.floor(m / 1440)} j ${Math.floor((m % 1440) / 60)} h`;
}

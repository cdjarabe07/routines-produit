import type { DateKey, ISODateTime, TimeOfDay } from '@/types/domain';

/* Dates de l'application.

   Deux notions distinctes :
   1. « Date opérationnelle » (jour, heure du jour) d'un INSTANT : toujours calculée dans le fuseau horaire de
      l'ATELIER, jamais dans celui du poste. Source unique : `settings.timezone` en base (même valeur que la
      fonction serveur app.today()), appliquée au démarrage de la session par <PlantTimeZone> (setPlantTimeZone).
      Sans réglage (mode démo local, poste = atelier), le fuseau du navigateur sert de repli.
   2. Arithmétique sur des dates « AAAA-MM-JJ » (ajout de jours, jour de la semaine, écart) : calendaire pure,
      calculée en UTC interne, donc indépendante de tout fuseau. */

const pad = (n: number) => String(n).padStart(2, '0');

/* ---------- Fuseau horaire de l'atelier ---------- */

let plantTimeZone: string | null = null;

/** Fuseau valide pour Intl ? */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Fixe le fuseau de l'atelier (null : repli sur le fuseau du navigateur). Renvoie false si le fuseau est invalide. */
export function setPlantTimeZone(tz: string | null | undefined): boolean {
  if (!tz) {
    plantTimeZone = null;
    return true;
  }
  if (!isValidTimeZone(tz)) return false;
  plantTimeZone = tz;
  return true;
}

/** Fuseau utilisé pour la date opérationnelle */
export function getPlantTimeZone(): string {
  return plantTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const wallFormatters = new Map<string, Intl.DateTimeFormat>();

/** Date et heure « murales » d'un instant dans le fuseau de l'atelier */
function wallClock(date: Date): { y: number; m: number; d: number; h: number; min: number } {
  const tz = getPlantTimeZone();
  let fmt = wallFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    wallFormatters.set(tz, fmt);
  }
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, min: Number(p.minute) };
}

/* ---------- Date opérationnelle d'un instant ---------- */

/** Jour (AAAA-MM-JJ) d'un instant, dans le fuseau de l'atelier */
export function toDateKey(date: Date = new Date()): DateKey {
  const w = wallClock(date);
  return `${w.y}-${pad(w.m)}-${pad(w.d)}`;
}

/** Date opérationnelle du jour, dans le fuseau de l'atelier */
export const todayKey = (): DateKey => toDateKey(new Date());

export function dateKeyOf(iso: ISODateTime): DateKey {
  return toDateKey(new Date(iso));
}

/** Minutes écoulées depuis minuit, dans le fuseau de l'atelier */
export function minutesOfDay(date: Date = new Date()): number {
  const w = wallClock(date);
  return w.h * 60 + w.min;
}

/** Instant correspondant à une heure HH:mm de l'atelier, un jour donné (changements d'heure compris). */
export function atTime(key: DateKey, time: TimeOfDay): ISODateTime {
  const [y, m, d] = key.split('-').map(Number);
  const mins = timeToMinutes(time);
  const target = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, Math.floor(mins / 60), mins % 60);
  // On part de l'heure lue comme UTC, puis on corrige du décalage du fuseau (deux passes pour les changements d'heure)
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const w = wallClock(new Date(guess));
    const diff = Date.UTC(w.y, w.m - 1, w.d, w.h, w.min) - target;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess).toISOString();
}

/** Bornes horaires de journées de l'atelier : début de `from` (inclus) → début du lendemain de `to` (exclu). */
export function dayRange(from: DateKey, to: DateKey): { gte: ISODateTime; lt: ISODateTime } {
  return { gte: atTime(from, '00:00'), lt: atTime(addDays(to, 1), '00:00') };
}

export function minutesBetween(fromIso: ISODateTime, to: Date | ISODateTime = new Date()): number {
  const end = typeof to === 'string' ? new Date(to) : to;
  return Math.max(0, Math.floor((end.getTime() - new Date(fromIso).getTime()) / 60_000));
}

/* ---------- Arithmétique calendaire (sans fuseau) ---------- */

const utcOf = (key: DateKey) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};
const keyOfUtc = (ms: number): DateKey => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** Date « AAAA-MM-JJ » sous forme de Date à minuit UTC (calcul calendaire, jamais un instant de l'atelier) */
export function parseDateKey(key: DateKey): Date {
  return new Date(utcOf(key));
}

export function addDays(key: DateKey, days: number): DateKey {
  return keyOfUtc(utcOf(key) + days * 86_400_000);
}

export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((utcOf(to) - utcOf(from)) / 86_400_000);
}

export function enumerateDays(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
export function isoWeekday(key: DateKey): number {
  const d = new Date(utcOf(key)).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Lundi de la semaine contenant la date. */
export const startOfWeek = (key: DateKey): DateKey => addDays(key, 1 - isoWeekday(key));

/** Premier jour du mois de la date */
export const startOfMonth = (key: DateKey): DateKey => `${key.slice(0, 7)}-01`;

export function timeToMinutes(time: TimeOfDay): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/* ---------- Affichage ----------
   Une date « AAAA-MM-JJ » s'affiche telle quelle (aucune conversion) ; un instant s'affiche à l'heure de l'atelier,
   cohérente avec les horaires planifiés. */

const displayFormatters = new Map<string, Intl.DateTimeFormat>();

function display(options: Intl.DateTimeFormatOptions, v: DateKey | ISODateTime | Date): string {
  const isKey = typeof v === 'string' && v.length === 10;
  const timeZone = isKey ? 'UTC' : getPlantTimeZone();
  const cacheKey = `${timeZone}|${JSON.stringify(options)}`;
  let fmt = displayFormatters.get(cacheKey);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('fr-FR', { ...options, timeZone });
    displayFormatters.set(cacheKey, fmt);
  }
  return fmt.format(isKey ? parseDateKey(v) : v instanceof Date ? v : new Date(v));
}

export const formatDate = (v: DateKey | ISODateTime | Date) => display({ day: '2-digit', month: '2-digit', year: 'numeric' }, v);
export const formatShortDate = (v: DateKey | ISODateTime | Date) => display({ day: '2-digit', month: 'short' }, v);
export const formatLongDate = (v: DateKey | ISODateTime | Date) => display({ weekday: 'long', day: 'numeric', month: 'long' }, v);
export const formatTime = (v: ISODateTime | Date) => display({ hour: '2-digit', minute: '2-digit' }, v);
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

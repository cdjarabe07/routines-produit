import type { Tone } from '@/components/ui/Badge';
import type { DateKey, Role, RoutineItem, RoutineRun, RoutineTemplate } from '@/types/domain';
import { minutesOfDay, timeToMinutes } from '@/utils/date';

/* Règles des routines.
   Une exécution (RoutineRun) par modèle et par jour, partagée par les personnes du rôle. */

export const templateItems = (t: RoutineTemplate): RoutineItem[] => t.sections.flatMap((s) => s.items);

export interface RunProgress {
  total: number;
  treated: number;
  ok: number;
  ko: number;
  na: number;
}

export function runProgress(template: RoutineTemplate, run?: RoutineRun): RunProgress {
  const items = templateItems(template);
  const p: RunProgress = { total: items.length, treated: 0, ok: 0, ko: 0, na: 0 };
  if (!run) return p;
  for (const item of items) {
    const r = run.results[item.id];
    if (!r) continue;
    p.treated += 1;
    p[r.status] += 1;
  }
  return p;
}

export type RoutineState = 'done' | 'late' | 'due' | 'upcoming';

export const ROUTINE_STATE: Record<RoutineState, { label: string; tone: Tone }> = {
  done: { label: 'Terminée', tone: 'success' },
  late: { label: 'En retard', tone: 'danger' },
  due: { label: 'À faire', tone: 'warning' },
  upcoming: { label: 'Prévue', tone: 'neutral' },
};

/**
 * État d'une routine pour un jour donné.
 * - done : tous les points traités
 * - late : heure prévue + tolérance dépassée (jour courant) ou jour passé non terminé
 * - due : heure prévue passée, dans la tolérance
 * - upcoming : avant l'heure prévue
 */
export function routineState(
  template: RoutineTemplate,
  run: RoutineRun | undefined,
  date: DateKey,
  today: DateKey,
  now: Date,
  toleranceMin: number,
): RoutineState {
  const p = runProgress(template, run);
  if (p.total > 0 && p.treated === p.total) return 'done';
  if (date < today) return 'late';
  if (date > today) return 'upcoming';
  const minutes = minutesOfDay(now);
  const scheduled = timeToMinutes(template.scheduledTime);
  if (minutes < scheduled) return 'upcoming';
  return minutes - scheduled > toleranceMin ? 'late' : 'due';
}

/** Qui peut saisir une routine : son rôle cible, ou un gestionnaire des routines. Jour courant uniquement. */
export const canEditRun = (template: RoutineTemplate, role: Role, canManage: boolean, date: DateKey, today: DateKey) =>
  date === today && (template.role === role || canManage);

export const templatesForRole = (templates: RoutineTemplate[], role: Role) =>
  templates.filter((t) => t.active && t.role === role).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

export const findRun = (runs: RoutineRun[], templateId: string, date: DateKey) =>
  runs.find((r) => r.templateId === templateId && r.date === date);

/** Réalisation d'une journée : points traités / points prévus des modèles actifs. */
export function dayCompletion(templates: RoutineTemplate[], runs: RoutineRun[], date: DateKey) {
  let total = 0;
  let treated = 0;
  let completedRoutines = 0;
  const active = templates.filter((t) => t.active);
  for (const t of active) {
    const p = runProgress(t, findRun(runs, t.id, date));
    total += p.total;
    treated += p.treated;
    if (p.total > 0 && p.treated === p.total) completedRoutines += 1;
  }
  return { total, treated, completedRoutines, routines: active.length };
}

/** Routine terminée à l'heure : dernier point traité avant heure prévue + tolérance. */
export function completedOnTime(template: RoutineTemplate, run: RoutineRun | undefined, toleranceMin: number): boolean {
  if (!run?.completedAt) return false;
  const done = new Date(run.completedAt);
  return minutesOfDay(done) <= timeToMinutes(template.scheduledTime) + toleranceMin;
}

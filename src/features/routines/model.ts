import type {
  Checklist,
  ChecklistItem,
  CheckResult,
  CheckType,
  CheckValue,
  ID,
  ItemResult,
  RoutineRun,
  RoutineTask,
  RoutineTemplate,
} from '@/types/domain';

/* Règles d'exécution d'une routine (docs/implementation-plan.md §2).
   Une tâche sans contrôle se valide en un geste (résultat indexé par l'id de la tâche).
   Une tâche avec contrôles (propres ou checklist jointe) est faite quand ses contrôles obligatoires sont renseignés. */

export const CHECK_TYPE_LABELS: Record<CheckType, string> = {
  conformity: 'Conforme / non conforme',
  yes_no: 'Oui / non',
  number: 'Valeur numérique',
  text: 'Texte court',
  select: 'Choix dans une liste',
  comment: 'Commentaire',
};

/** Clé de résultat d'un contrôle dans une tâche. */
export const checkKey = (taskId: ID, checkId: ID) => `${taskId}/${checkId}`;

/** Contrôles effectifs d'une tâche : checklist jointe puis contrôles propres. */
export function taskChecks(task: RoutineTask, checklists: Map<ID, Checklist>): ChecklistItem[] {
  const shared = task.checklistId ? (checklists.get(task.checklistId)?.items ?? []) : [];
  return [...shared, ...task.checks];
}

/**
 * Résultat d'un contrôle selon sa valeur.
 * - conformité : la valeur est le résultat ;
 * - oui/non : oui = conforme ;
 * - nombre : conforme dans les bornes (bornes absentes = pas de limite) ;
 * - texte, choix, commentaire : information, toujours conforme.
 */
export function evaluateCheck(item: ChecklistItem, value: CheckValue): CheckResult {
  switch (item.type) {
    case 'conformity':
      return value === 'ko' ? 'ko' : value === 'na' ? 'na' : 'ok';
    case 'yes_no':
      return value === true ? 'ok' : 'ko';
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return 'ko';
      if (item.min !== undefined && n < item.min) return 'ko';
      if (item.max !== undefined && n > item.max) return 'ko';
      return 'ok';
    }
    default:
      return 'ok';
  }
}

/** Texte lisible d'une valeur saisie. */
export function formatCheckValue(item: ChecklistItem, result: ItemResult): string {
  if (item.type === 'conformity') return result.status === 'ok' ? 'Conforme' : result.status === 'ko' ? 'Non conforme' : 'Non applicable';
  if (item.type === 'yes_no') return result.value === true ? 'Oui' : 'Non';
  if (item.type === 'number') {
    const n =
      typeof result.value === 'number' ? result.value.toLocaleString('fr-FR', { maximumFractionDigits: 3 }) : String(result.value ?? '');
    return `${n}${item.unit ? ` ${item.unit}` : ''}`;
  }
  return String(result.value ?? '');
}

export type TaskState = 'todo' | 'partial' | 'done';

export interface TaskProgress {
  state: TaskState;
  answered: number;
  total: number;
  ko: number;
}

export function taskProgress(task: RoutineTask, checks: ChecklistItem[], run?: RoutineRun): TaskProgress {
  const results = run?.results ?? {};
  if (checks.length === 0) {
    const r = results[task.id];
    return { state: r ? 'done' : 'todo', answered: r ? 1 : 0, total: 1, ko: r?.status === 'ko' ? 1 : 0 };
  }
  const answered = checks.filter((c) => results[checkKey(task.id, c.id)]);
  const ko = answered.filter((c) => results[checkKey(task.id, c.id)]?.status === 'ko').length;
  const requiredMissing = checks.some((c) => c.required && !results[checkKey(task.id, c.id)]);
  const validated = Boolean(results[task.id]);
  const state: TaskState = validated || (!requiredMissing && answered.length > 0) ? 'done' : answered.length > 0 ? 'partial' : 'todo';
  return { state, answered: answered.length, total: checks.length, ko: ko + (results[task.id]?.status === 'ko' ? 1 : 0) };
}

export interface RunSummary {
  tasks: number;
  tasksDone: number;
  required: number;
  requiredDone: number;
  ko: number;
  /** Toutes les tâches obligatoires sont faites : la routine peut être terminée */
  canComplete: boolean;
  /** Durée réelle en minutes (routine terminée) */
  durationMin: number | null;
}

export function runSummary(routine: RoutineTemplate, checklists: Map<ID, Checklist>, run?: RoutineRun): RunSummary {
  let tasksDone = 0;
  let required = 0;
  let requiredDone = 0;
  let ko = 0;
  for (const task of routine.tasks) {
    const p = taskProgress(task, taskChecks(task, checklists), run);
    const done = p.state === 'done';
    if (done) tasksDone += 1;
    if (task.required) {
      required += 1;
      if (done) requiredDone += 1;
    }
    ko += p.ko;
  }
  const durationMin =
    run?.completedAt && run.startedAt
      ? Math.max(0, Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 60_000))
      : null;
  return { tasks: routine.tasks.length, tasksDone, required, requiredDone, ko, canComplete: requiredDone === required, durationMin };
}

/** Durée estimée : somme des tâches, ou durée prévue de la routine. */
export const estimatedMinutes = (routine: RoutineTemplate) =>
  routine.tasks.reduce((sum, t) => sum + (t.estimatedMin ?? 0), 0) || routine.durationMin;

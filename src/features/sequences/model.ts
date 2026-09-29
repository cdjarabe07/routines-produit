import type { Tone } from '@/components/ui/Badge';
import type { ID, ISODateTime, SequenceRun, SequenceRunStatus, SequenceStep, SequenceTemplate } from '@/types/domain';
import { toDateKey } from '@/utils/date';

/* Séquence guidée : machine à états pure.
   Le temps d'une étape = segments terminés (elapsedMs) + segment en cours (now - segmentStartedAt).
   Aucune dépendance à un minuteur JavaScript : l'état survit au rechargement et à la veille. */

export const RUN_STATUS: Record<SequenceRunStatus, { label: string; tone: Tone }> = {
  running: { label: 'En cours', tone: 'info' },
  paused: { label: 'En pause', tone: 'warning' },
  completed: { label: 'Terminée', tone: 'success' },
  aborted: { label: 'Abandonnée', tone: 'neutral' },
};

export type RunState = Pick<SequenceRun, 'status' | 'currentStepIndex' | 'segmentStartedAt' | 'steps' | 'completedAt'>;

const ms = (iso: ISODateTime | null, now: Date) => (iso ? Math.max(0, now.getTime() - new Date(iso).getTime()) : 0);

export function stepElapsedMs(run: RunState, index: number, now: Date): number {
  const log = run.steps[index];
  if (!log) return 0;
  const live = run.status === 'running' && run.currentStepIndex === index ? ms(run.segmentStartedAt, now) : 0;
  return log.elapsedMs + live;
}

export const totalElapsedMs = (run: RunState, now: Date) => run.steps.reduce((sum, _, i) => sum + stepElapsedMs(run, i, now), 0);

/** Étapes exécutées : les étapes désactivées sont ignorées. */
export const activeSteps = (template: SequenceTemplate) => template.steps.filter((s) => s.active);

/** Étapes d'une exécution, dans son ordre (celui du démarrage), même si le modèle a changé depuis. */
export const runSteps = (template: SequenceTemplate, run: Pick<SequenceRun, 'steps'>) =>
  run.steps.map((log) => template.steps.find((s) => s.id === log.stepId)).filter((s): s is SequenceStep => Boolean(s));

export const plannedMs = (template: SequenceTemplate) => activeSteps(template).reduce((s, st) => s + st.durationMin * 60_000, 0);

/** Clôt le segment en cours (ajoute son temps à l'étape courante). */
function closeSegment(run: RunState, now: Date): RunState['steps'] {
  return run.steps.map((log, i) =>
    i === run.currentStepIndex && run.status === 'running' ? { ...log, elapsedMs: log.elapsedMs + ms(run.segmentStartedAt, now) } : log,
  );
}

export function startRun(template: SequenceTemplate, userId: ID, now: Date): Omit<SequenceRun, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    templateId: template.id,
    date: toDateKey(now),
    startedBy: userId,
    status: 'running',
    currentStepIndex: 0,
    segmentStartedAt: now.toISOString(),
    steps: activeSteps(template).map((s) => ({ stepId: s.id, elapsedMs: 0 })),
  };
}

export function pauseRun<T extends RunState>(run: T, now: Date): T {
  if (run.status !== 'running') return run;
  return { ...run, steps: closeSegment(run, now), status: 'paused', segmentStartedAt: null };
}

export function resumeRun<T extends RunState>(run: T, now: Date): T {
  if (run.status !== 'paused') return run;
  return { ...run, status: 'running', segmentStartedAt: now.toISOString() };
}

/** Valide l'étape courante et passe à la suivante ; termine la séquence après la dernière. */
export function nextStep<T extends RunState>(run: T, now: Date): T {
  if (run.status === 'completed' || run.status === 'aborted') return run;
  const steps = closeSegment(run, now).map((log, i) => (i === run.currentStepIndex ? { ...log, completedAt: now.toISOString() } : log));
  const last = run.currentStepIndex >= run.steps.length - 1;
  if (last) return { ...run, steps, status: 'completed', segmentStartedAt: null, completedAt: now.toISOString() };
  return {
    ...run,
    steps,
    currentStepIndex: run.currentStepIndex + 1,
    segmentStartedAt: run.status === 'running' ? now.toISOString() : null,
  };
}

/** Revient à l'étape précédente, qui redevient à faire (son temps déjà passé est conservé). */
export function previousStep<T extends RunState>(run: T, now: Date): T {
  if (run.currentStepIndex === 0 || run.status === 'completed' || run.status === 'aborted') return run;
  const target = run.currentStepIndex - 1;
  const steps = closeSegment(run, now).map((log, i) => (i === target ? { ...log, completedAt: undefined } : log));
  return { ...run, steps, currentStepIndex: target, segmentStartedAt: run.status === 'running' ? now.toISOString() : null };
}

export function abortRun<T extends RunState>(run: T, now: Date): T {
  if (run.status === 'completed' || run.status === 'aborted') return run;
  return { ...run, steps: closeSegment(run, now), status: 'aborted', segmentStartedAt: null, completedAt: now.toISOString() };
}

export const isLive = (run: Pick<SequenceRun, 'status'>) => run.status === 'running' || run.status === 'paused';

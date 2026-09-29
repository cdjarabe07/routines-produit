import { useOperation } from '@/hooks/useData';
import type { NewEntity } from '@/services/data/types';
import type { ID, SequenceRun, SequenceTemplate, User } from '@/types/domain';
import { abortRun, nextStep, pauseRun, previousStep, resumeRun, startRun, type RunState } from './model';

export function useStartSequence() {
  return useOperation(
    (ds, { template, user }: { template: SequenceTemplate; user: User }) => ds.repo('sequenceRuns').create(startRun(template, user.id, new Date())),
    { invalidates: ['sequenceRuns'] },
  );
}

export type Transition = 'pause' | 'resume' | 'next' | 'previous' | 'abort';

const TRANSITIONS: Record<Transition, (run: RunState, now: Date) => RunState> = {
  pause: pauseRun,
  resume: resumeRun,
  next: nextStep,
  previous: previousStep,
  abort: abortRun,
};

export function useSequenceTransition() {
  return useOperation(
    async (ds, { run, transition }: { run: SequenceRun; transition: Transition }) => {
      // Relire l'état courant : une autre tablette a pu faire avancer la séquence
      const fresh = await ds.repo('sequenceRuns').get(run.id);
      const next = TRANSITIONS[transition](fresh, new Date());
      return ds.repo('sequenceRuns').update(run.id, next);
    },
    { invalidates: ['sequenceRuns'], success: (r) => (r.status === 'completed' ? 'Séquence terminée.' : r.status === 'aborted' ? 'Séquence abandonnée.' : null) },
  );
}

export function useSaveSequenceTemplate() {
  return useOperation(
    (ds, { id, input }: { id?: ID; input: NewEntity<SequenceTemplate> }) =>
      id ? ds.repo('sequenceTemplates').update(id, input) : ds.repo('sequenceTemplates').create(input),
    { invalidates: ['sequenceTemplates'], success: 'Séquence enregistrée.' },
  );
}

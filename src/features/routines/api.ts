import { useOperation } from '@/hooks/useData';
import { ValidationError } from '@/services/errors';
import type { DataSource, NewEntity } from '@/services/data/types';
import type { Checklist, DateKey, ID, ItemResult, RoutineRun, RoutineTemplate, Schedule, User } from '@/types/domain';
import { addDays, todayKey } from '@/utils/date';
import { isAssignedTo } from '@/features/planning/model';
import { buildSample, hasSampling, runSummary } from './model';

/* Opérations d'exécution et de configuration des routines. */

async function findRun(ds: DataSource, scheduleId: ID, date: DateKey, slot?: string) {
  return (await ds.repo('routineRuns').list({ where: { scheduleId, date } })).find((r) => (r.slot ?? '') === (slot ?? ''));
}

/** Démarrer : crée l'exécution de l'occurrence (ou reprend celle qui existe). */
export function useStartRoutine() {
  return useOperation(
    async (ds, { schedule, date, slot, user }: { schedule: Schedule; date: DateKey; slot?: string; user: User }): Promise<RoutineRun> => {
      if (date !== todayKey()) throw new ValidationError('Seules les routines du jour peuvent être démarrées.');
      if (!isAssignedTo(schedule, user)) throw new ValidationError('Cette routine ne vous est pas affectée.');
      const existing = await findRun(ds, schedule.id, date, slot);
      if (existing) return existing;
      // Questions tournantes : le tour dépend du nombre d'exécutions déjà faites de la planification
      const routine = await ds.repo('routineTemplates').get(schedule.routineId);
      let sample: Record<ID, ID[]> | undefined;
      if (hasSampling(routine)) {
        const ids = Array.from(new Set(routine.tasks.map((t) => t.checklistId).filter((id): id is ID => Boolean(id))));
        const checklists = new Map((await Promise.all(ids.map((id) => ds.repo('checklists').get(id)))).map((c) => [c.id, c]));
        const round = (await ds.repo('routineRuns').list({ where: { scheduleId: schedule.id } })).length;
        sample = buildSample(routine, checklists, round);
      }
      return ds.repo('routineRuns').create({
        scheduleId: schedule.id,
        templateId: schedule.routineId,
        date,
        ...(slot ? { slot } : {}),
        ...(sample ? { sample } : {}),
        assigneeId: user.id,
        startedAt: new Date().toISOString(),
        results: {},
      });
    },
    { invalidates: ['routineRuns'] },
  );
}

export interface RecordInput {
  run: RoutineRun;
  key: string;
  /** null = annuler la saisie */
  result: Omit<ItemResult, 'at' | 'by'> | null;
  user: User;
}

/** Enregistre un résultat (tâche ou contrôle). Relit l'exécution : une autre tablette a pu saisir entre-temps. */
export function useRecordResult() {
  return useOperation(
    async (ds, { run, key, result, user }: RecordInput) => {
      if (ds.recordRunResult) return ds.recordRunResult(run.id, key, result && { ...result, comment: result.comment?.trim() || undefined });
      const fresh = await ds.repo('routineRuns').get(run.id);
      if (fresh.completedAt) throw new ValidationError('Cette routine est terminée : elle n’est plus modifiable.');
      const results = { ...fresh.results };
      if (result === null) delete results[key];
      else results[key] = { ...result, comment: result.comment?.trim() || undefined, at: new Date().toISOString(), by: user.id };
      return ds.repo('routineRuns').update(run.id, { results });
    },
    { invalidates: ['routineRuns'] },
  );
}

/** Terminer : toutes les tâches obligatoires doivent être faites. */
export function useCompleteRoutine() {
  return useOperation(
    async (
      ds,
      { run, routine, checklists, user }: { run: RoutineRun; routine: RoutineTemplate; checklists: Map<ID, Checklist>; user: User },
    ) => {
      const fresh = await ds.repo('routineRuns').get(run.id);
      const summary = runSummary(routine, checklists, fresh);
      if (!summary.canComplete) {
        throw new ValidationError(`Il reste ${summary.required - summary.requiredDone} tâche(s) obligatoire(s) à faire.`);
      }
      return ds.repo('routineRuns').update(run.id, { completedAt: new Date().toISOString(), completedBy: user.id });
    },
    { invalidates: ['routineRuns'], success: 'Routine terminée.' },
  );
}

/* ---------- Configuration ---------- */

export type RoutineTemplateInput = NewEntity<RoutineTemplate>;

export function useSaveRoutineTemplate() {
  return useOperation(
    (ds, { id, input }: { id?: ID; input: RoutineTemplateInput }) =>
      id ? ds.repo('routineTemplates').update(id, input) : ds.repo('routineTemplates').create(input),
    { invalidates: ['routineTemplates'], success: 'Routine enregistrée.' },
  );
}

/**
 * Archiver une routine : ses planifications actives s'arrêtent à la veille (l'historique reste intact).
 * Réactiver ne relance pas les planifications : il faut replanifier.
 */
export function useSetTemplateActive() {
  return useOperation(
    async (ds, { id, active }: { id: ID; active: boolean }) => {
      if (!active) {
        const yesterday = addDays(todayKey(), -1);
        const schedules = await ds.repo('schedules').list({ where: { routineId: id } });
        await Promise.all(
          schedules
            .filter((s) => s.status === 'active' && (!s.endDate || s.endDate > yesterday))
            .map((s) =>
              s.startDate > yesterday
                ? ds.repo('schedules').update(s.id, { status: 'cancelled' })
                : ds.repo('schedules').update(s.id, { endDate: yesterday }),
            ),
        );
      }
      return ds.repo('routineTemplates').update(id, { active });
    },
    {
      invalidates: ['routineTemplates', 'schedules'],
      success: (t) =>
        t.active
          ? 'Routine réactivée. Planifiez-la pour qu’elle soit de nouveau exécutée.'
          : 'Routine archivée : ses planifications sont arrêtées.',
    },
  );
}

/** Photo jointe à un contrôle : stockée à part (taille), puis référencée dans le résultat. */
export function useAddRunPhoto() {
  return useOperation(
    async (ds, { run, key, photo, user }: { run: RoutineRun; key: string; photo: string; user: User }) =>
      ds.repo('runPhotos').create({ runId: run.id, key, photo, takenBy: user.id }),
    { invalidates: ['runPhotos'] },
  );
}

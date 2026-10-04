import { useMemo } from 'react';
import { notify } from '@/features/notifications/api';
import { useCollection, useOperation } from '@/hooks/useData';
import { ValidationError } from '@/services/errors';
import type { DataSource, NewEntity } from '@/services/data/types';
import type { DateKey, ID, Schedule, User } from '@/types/domain';
import { addDays, formatDate } from '@/utils/date';
import { describeRecurrence, type OccurrenceSource } from './model';

/** Données nécessaires au calcul des occurrences (planifications, routines, exécutions, checklists).
    Les exécutions sont chargées pour la seule plage de jours affichée (`from` et `to` inclus) : leur historique grossit chaque jour. */
export function usePlanningData(days: { from: DateKey; to: DateKey }) {
  const schedules = useCollection('schedules');
  const routines = useCollection('routineTemplates');
  const runs = useCollection('routineRuns', { range: { field: 'date', gte: days.from, lt: addDays(days.to, 1) } });
  const checklists = useCollection('checklists');
  const source = useMemo<OccurrenceSource | null>(
    () => (schedules.data && routines.data && runs.data ? { schedules: schedules.data, routines: routines.data, runs: runs.data } : null),
    [schedules.data, routines.data, runs.data],
  );
  const checklistById = useMemo(() => new Map((checklists.data ?? []).map((c) => [c.id, c])), [checklists.data]);
  return { queries: [schedules, routines, runs, checklists], source, checklistById };
}

export type ScheduleInput = Omit<NewEntity<Schedule>, 'createdBy' | 'status' | 'skippedDates'>;

function validate(input: ScheduleInput) {
  if (!input.assigneeId && !input.teamId) throw new ValidationError('Affectez la routine à une personne ou à une équipe.');
  if (input.endDate && input.endDate < input.startDate) throw new ValidationError('La date de fin précède la date de début.');
  if (input.recurrence === 'weekly' && input.weekdays.length === 0) throw new ValidationError('Choisissez au moins un jour de la semaine.');
  if (input.everyHours !== undefined) {
    if (!Number.isInteger(input.everyHours) || input.everyHours < 1 || input.everyHours > 12)
      throw new ValidationError('L’intervalle de répétition doit être compris entre 1 et 12 heures.');
    if (!input.endTime || input.endTime <= input.time) throw new ValidationError('L’heure de fin doit suivre l’heure de début.');
  }
}

/** Personnes concernées par une planification (affectée directement ou membres actifs de l'équipe). */
async function recipients(ds: DataSource, s: Pick<Schedule, 'assigneeId' | 'teamId'>): Promise<ID[]> {
  if (s.assigneeId) return [s.assigneeId];
  if (!s.teamId) return [];
  return (await ds.repo('users').list({ where: { teamId: s.teamId } })).filter((u) => u.active).map((u) => u.id);
}

export function useSaveSchedule() {
  return useOperation(
    async (ds, { id, input, actor }: { id?: ID; input: ScheduleInput; actor: User }) => {
      validate(input);
      const routine = await ds.repo('routineTemplates').get(input.routineId);
      if (!routine.active) throw new ValidationError('Cette routine est archivée : réactivez-la avant de la planifier.');
      const saved = id
        ? await ds.repo('schedules').update(id, input)
        : await ds.repo('schedules').create({ ...input, status: 'active', skippedDates: [], createdBy: actor.id });
      await notify(
        ds,
        await recipients(ds, saved),
        {
          kind: 'routine_assigned',
          title: `${id ? 'Planification modifiée' : 'Routine planifiée'} : ${routine.title} — ${describeRecurrence(saved).toLowerCase()} à ${saved.time}, à partir du ${formatDate(saved.startDate)}`,
          link: '/app/routines',
        },
        actor.id,
      );
      return saved;
    },
    {
      invalidates: ['schedules', 'notifications'],
      success: (s) =>
        s.createdAt === s.updatedAt ? 'Routine planifiée. Les personnes affectées sont prévenues.' : 'Planification modifiée.',
    },
  );
}

/** Annuler toute la planification (les exécutions passées sont conservées). */
export function useCancelSchedule() {
  return useOperation((ds, { id }: { id: ID }) => ds.repo('schedules').update(id, { status: 'cancelled' }), {
    invalidates: ['schedules'],
    success: 'Planification annulée. L’historique des exécutions est conservé.',
  });
}

export function useRestoreSchedule() {
  return useOperation((ds, { id }: { id: ID }) => ds.repo('schedules').update(id, { status: 'active' }), {
    invalidates: ['schedules'],
    success: 'Planification réactivée.',
  });
}

/** Annuler une seule occurrence. Impossible si elle a déjà été démarrée. */
export function useSkipOccurrence() {
  return useOperation(
    async (ds, { schedule, date }: { schedule: Schedule; date: DateKey }) => {
      const started = (await ds.repo('routineRuns').list({ where: { scheduleId: schedule.id, date } })).length > 0;
      if (started) throw new ValidationError('Cette occurrence a déjà été démarrée : elle ne peut plus être annulée.');
      const fresh = await ds.repo('schedules').get(schedule.id);
      return ds.repo('schedules').update(schedule.id, { skippedDates: Array.from(new Set([...fresh.skippedDates, date])) });
    },
    { invalidates: ['schedules'], success: 'Occurrence annulée.' },
  );
}

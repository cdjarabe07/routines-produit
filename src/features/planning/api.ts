import { useMemo } from 'react';
import { notify } from '@/features/notifications/api';
import { useCollection, useOperation } from '@/hooks/useData';
import { ValidationError } from '@/services/errors';
import type { DataSource, NewEntity } from '@/services/data/types';
import type { DateKey, ID, ProductionOrder, RoutineTrigger, Schedule, User } from '@/types/domain';
import { addDays, formatDate, minutesOfDay, todayKey } from '@/utils/date';
import { describeRecurrence, type OccurrenceSource } from './model';

/** Données nécessaires au calcul des occurrences (planifications, routines, exécutions, checklists).
    Les exécutions sont chargées pour la seule plage de jours affichée (`from` et `to` inclus) : leur historique grossit chaque jour. */
export function usePlanningData(days: { from: DateKey; to: DateKey }) {
  const schedules = useCollection('schedules');
  const routines = useCollection('routineTemplates');
  const runs = useCollection('routineRuns', { range: { field: 'date', gte: days.from, lt: addDays(days.to, 1) } });
  const triggers = useCollection('routineTriggers', { range: { field: 'date', gte: days.from, lt: addDays(days.to, 1) } });
  const checklists = useCollection('checklists');
  const source = useMemo<OccurrenceSource | null>(
    () =>
      schedules.data && routines.data && runs.data && triggers.data
        ? { schedules: schedules.data, routines: routines.data, runs: runs.data, triggers: triggers.data }
        : null,
    [schedules.data, routines.data, runs.data, triggers.data],
  );
  const checklistById = useMemo(() => new Map((checklists.data ?? []).map((c) => [c.id, c])), [checklists.data]);
  return { queries: [schedules, routines, runs, triggers, checklists], source, checklistById };
}

export type ScheduleInput = Omit<NewEntity<Schedule>, 'createdBy' | 'status' | 'skippedDates'>;

function validate(input: ScheduleInput) {
  if (!input.assigneeId && !input.teamId) throw new ValidationError('Affectez la routine à une personne ou à une équipe.');
  if (input.endDate && input.endDate < input.startDate) throw new ValidationError('La date de fin précède la date de début.');
  if (input.recurrence === 'weekly' && input.weekdays.length === 0) throw new ValidationError('Choisissez au moins un jour de la semaine.');
  if (input.triggerOn && input.recurrence !== 'on_demand')
    throw new ValidationError('Le déclenchement automatique concerne les routines sur événement.');
  if (input.recurrence === 'on_demand' && input.everyHours !== undefined)
    throw new ValidationError('Une routine sur événement ne se répète pas dans la journée.');
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

/** Créneau du déclenchement : l'heure de l'atelier, à la minute */
function nowSlot(): string {
  const m = minutesOfDay();
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Crée l'occurrence d'une planification sur événement (une seule par minute : un même événement n'est pas compté deux fois). */
async function createTrigger(
  ds: DataSource,
  schedule: Schedule,
  { reason, orderId, userId }: { reason: string; orderId?: ID; userId?: ID },
): Promise<RoutineTrigger> {
  const date = todayKey();
  const slot = nowSlot();
  const existing = (await ds.repo('routineTriggers').list({ where: { scheduleId: schedule.id, date } })).find((t) => t.slot === slot);
  if (existing) return existing;
  const trigger = await ds.repo('routineTriggers').create({
    scheduleId: schedule.id,
    date,
    slot,
    reason: reason.slice(0, 200),
    ...(orderId ? { orderId } : {}),
    ...(userId ? { triggeredBy: userId } : {}),
  });
  const routine = await ds.repo('routineTemplates').get(schedule.routineId);
  await notify(
    ds,
    await recipients(ds, schedule),
    {
      kind: 'routine_assigned',
      title: `Routine à réaliser : ${routine.title} — ${trigger.reason}`,
      link: `/app/routines/${schedule.id}/${date}/${slot.replace(':', '')}`,
    },
    userId,
  );
  return trigger;
}

/** Déclencher manuellement une routine sur événement (changement de série, d'outil, nouveau lot…). */
export function useTriggerRoutine() {
  return useOperation(
    async (ds, { schedule, reason, user }: { schedule: Schedule; reason: string; user: User }) => {
      if (schedule.recurrence !== 'on_demand' || schedule.status !== 'active')
        throw new ValidationError('Cette routine ne se déclenche pas sur événement.');
      if (reason.trim().length < 2) throw new ValidationError('Indiquez le motif du déclenchement.');
      return createTrigger(ds, schedule, { reason: reason.trim(), userId: user.id });
    },
    { invalidates: ['routineTriggers', 'notifications'], success: 'Routine déclenchée. Les personnes concernées sont prévenues.' },
  );
}

/** Démarrage d'un ordre de fabrication : déclenche les routines prévues à cet effet sur sa ligne.
    Backend Supabase : fait par le serveur (trigger order_start_routines), y compris pour les mises à jour venues de l'ERP. */
export async function triggerOrderStart(ds: DataSource, order: ProductionOrder, userId?: ID): Promise<number> {
  if (ds.serverSideEffects) return 0;
  const schedules = (await ds.repo('schedules').list()).filter(
    (s) =>
      s.status === 'active' && s.recurrence === 'on_demand' && s.triggerOn === 'order_start' && (!s.lineId || s.lineId === order.lineId),
  );
  for (const s of schedules) await createTrigger(ds, s, { reason: `Démarrage OF ${order.reference}`, orderId: order.id, userId });
  return schedules.length;
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

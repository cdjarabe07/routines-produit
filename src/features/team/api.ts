import { useOperation } from '@/hooks/useData';
import { ValidationError } from '@/services/errors';
import type { NewEntity } from '@/services/data/types';
import type { DateKey, Handover, ID, Leave, PresenceStatus } from '@/types/domain';

/** Saisie de présence : une ligne par personne et par jour (mise à jour si elle existe). */
export function useSetPresence() {
  return useOperation(
    async (ds, { userId, date, status, recordedBy }: { userId: ID; date: DateKey; status: PresenceStatus; recordedBy: ID }) => {
      const existing = (await ds.repo('presence').list({ where: { userId, date } }))[0];
      return existing ? ds.repo('presence').update(existing.id, { status, recordedBy }) : ds.repo('presence').create({ userId, date, status, recordedBy });
    },
    { invalidates: ['presence'] },
  );
}

export function useCreateLeave() {
  return useOperation(
    async (ds, input: NewEntity<Leave>) => {
      if (input.to < input.from) throw new ValidationError('La date de fin doit être postérieure à la date de début.');
      const overlapping = (await ds.repo('leaves').list({ where: { userId: input.userId } })).some((l) => l.from <= input.to && l.to >= input.from);
      if (overlapping) throw new ValidationError('Un congé existe déjà sur cette période pour cette personne.');
      return ds.repo('leaves').create(input);
    },
    { invalidates: ['leaves'], success: 'Congé enregistré — le statut est mis à jour automatiquement.' },
  );
}

export function useDeleteLeave() {
  return useOperation((ds, id: ID) => ds.repo('leaves').remove(id), { invalidates: ['leaves'], success: 'Congé supprimé.' });
}

export function useCreateHandover() {
  return useOperation((ds, input: NewEntity<Handover>) => ds.repo('handovers').create(input), {
    invalidates: ['handovers'],
    success: 'Passation publiée.',
  });
}

export function useAcknowledgeHandover() {
  return useOperation(
    (ds, { id, userId }: { id: ID; userId: ID }) => ds.repo('handovers').update(id, { acknowledgedBy: userId, acknowledgedAt: new Date().toISOString() }),
    { invalidates: ['handovers'], success: 'Passation marquée comme lue.' },
  );
}

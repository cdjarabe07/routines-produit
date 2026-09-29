import { notify } from '@/features/notifications/api';
import { useOperation } from '@/hooks/useData';
import { ValidationError } from '@/services/errors';
import type { DataSource, EntityPatch, NewEntity } from '@/services/data/types';
import type { DateKey, ID, Meeting, User } from '@/types/domain';
import { addDays, enumerateDays, formatDate, isoWeekday } from '@/utils/date';
import { createId } from '@/utils/id';
import { invitedUserIds } from './model';

export type MeetingInput = Omit<NewEntity<Meeting>, 'attendeeIds' | 'minutes' | 'status' | 'seriesId'>;

export interface Repeat {
  /** Dernière date de la série (incluse) */
  until: DateKey;
  /** Uniquement du lundi au vendredi */
  weekdaysOnly: boolean;
}

const MAX_SERIES = 60;

function validate(input: MeetingInput) {
  if (input.endTime <= input.startTime) throw new ValidationError('L’heure de fin doit suivre l’heure de début.');
}

async function inviteNotification(ds: DataSource, meeting: Meeting, userIds: ID[], actor: User, label: string) {
  await notify(
    ds,
    userIds,
    {
      kind: 'meeting_invited',
      title: `${label} : ${meeting.title} — ${formatDate(meeting.date)} ${meeting.startTime}`,
      link: `/reunions/${meeting.id}`,
    },
    actor.id,
  );
}

/** Créer (éventuellement en série) ou modifier un événement ; les invités sont prévenus. */
export function useSaveMeeting() {
  return useOperation(
    async (ds, { id, input, repeat, actor }: { id?: ID; input: MeetingInput; repeat?: Repeat; actor: User }): Promise<Meeting[]> => {
      validate(input);
      const users = await ds.repo('users').list();
      if (id) {
        const before = await ds.repo('meetings').get(id);
        const updated = await ds.repo('meetings').update(id, input);
        const previously = new Set(invitedUserIds(before, users));
        const added = invitedUserIds(updated, users).filter((u) => !previously.has(u));
        await inviteNotification(ds, updated, added, actor, 'Invitation');
        const changed = before.date !== updated.date || before.startTime !== updated.startTime || before.location !== updated.location;
        if (changed)
          await inviteNotification(
            ds,
            updated,
            invitedUserIds(updated, users).filter((u) => previously.has(u)),
            actor,
            'Réunion modifiée',
          );
        return [updated];
      }
      const dates = repeat
        ? enumerateDays(input.date, repeat.until).filter((d) => !repeat.weekdaysOnly || isoWeekday(d) <= 5)
        : [input.date];
      if (dates.length === 0) throw new ValidationError('Aucune date dans la période de répétition.');
      if (dates.length > MAX_SERIES) throw new ValidationError(`Une série est limitée à ${MAX_SERIES} occurrences.`);
      const seriesId = repeat ? createId() : undefined;
      const created: Meeting[] = [];
      for (const date of dates) {
        created.push(
          await ds.repo('meetings').create({
            ...input,
            date,
            agenda: input.agenda.map((p) => ({ ...p, id: createId(), done: false })),
            attendeeIds: [],
            minutes: '',
            status: 'planned',
            seriesId,
          }),
        );
      }
      const first = created[0]!;
      await notify(
        ds,
        invitedUserIds(first, users),
        {
          kind: 'meeting_invited',
          title: `Invitation : ${first.title} — ${formatDate(first.date)} ${first.startTime}${created.length > 1 ? ` (série de ${created.length})` : ''}`,
          link: `/reunions/${first.id}`,
        },
        actor.id,
      );
      return created;
    },
    {
      invalidates: ['meetings', 'notifications'],
      success: (list) =>
        list.length > 1
          ? `${list.length} réunions planifiées. Les participants sont prévenus.`
          : 'Réunion enregistrée. Les participants sont prévenus.',
    },
  );
}

/** Mise à jour silencieuse (ordre du jour, présences, compte-rendu, statut). */
export function useUpdateMeeting(message?: string) {
  return useOperation((ds, { id, patch }: { id: ID; patch: EntityPatch<Meeting> }) => ds.repo('meetings').update(id, patch), {
    invalidates: ['meetings'],
    success: message,
  });
}

export function useCancelMeeting() {
  return useOperation(
    async (ds, { meeting, actor }: { meeting: Meeting; actor: User }) => {
      const updated = await ds.repo('meetings').update(meeting.id, { status: 'cancelled' });
      await inviteNotification(ds, updated, invitedUserIds(updated, await ds.repo('users').list()), actor, 'Annulée');
      return updated;
    },
    { invalidates: ['meetings', 'notifications'], success: 'Réunion annulée. Les participants sont prévenus.' },
  );
}

export function useDeleteMeeting() {
  return useOperation(
    async (ds, { meeting }: { meeting: Meeting }) => {
      const linked = (await ds.repo('actions').list()).some((a) => a.source.type === 'meeting' && a.source.id === meeting.id);
      if (linked) throw new ValidationError('Des actions ont été décidées dans cette réunion : annulez-la plutôt que de la supprimer.');
      await ds.repo('meetings').remove(meeting.id);
    },
    { invalidates: ['meetings'], success: 'Réunion supprimée.' },
  );
}

/** Dupliquer à une autre date : même contenu, présences et compte-rendu vides. */
export function useDuplicateMeeting() {
  return useOperation(
    async (ds, { meeting, date, actor }: { meeting: Meeting; date: DateKey; actor: User }) => {
      const copy = await ds.repo('meetings').create({
        title: meeting.title,
        type: meeting.type,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        location: meeting.location,
        description: meeting.description,
        organizerId: meeting.organizerId,
        participantIds: meeting.participantIds,
        teamIds: meeting.teamIds,
        date,
        status: 'planned',
        attendeeIds: [],
        minutes: '',
        seriesId: undefined,
        agenda: meeting.agenda.map((p) => ({ ...p, id: createId(), done: false })),
      });
      await inviteNotification(ds, copy, invitedUserIds(copy, await ds.repo('users').list()), actor, 'Invitation');
      return copy;
    },
    { invalidates: ['meetings', 'notifications'], success: (m) => `Réunion dupliquée au ${formatDate(m.date)}.` },
  );
}

/** Date par défaut d'une duplication : le lendemain (ou le lundi suivant pour un vendredi). */
export const nextWorkingDay = (date: DateKey) => {
  let d = addDays(date, 1);
  while (isoWeekday(d) > 5) d = addDays(d, 1);
  return d;
};

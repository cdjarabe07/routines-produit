import { useOperation } from '@/hooks/useData';
import type { EntityPatch, NewEntity } from '@/services/data/types';
import type { ID, Meeting } from '@/types/domain';

export function useCreateMeeting() {
  return useOperation((ds, input: NewEntity<Meeting>) => ds.repo('meetings').create(input), {
    invalidates: ['meetings'],
    success: 'Réunion planifiée.',
  });
}

/** Mise à jour silencieuse (cases à cocher, présences, compte-rendu). */
export function useUpdateMeeting(message?: string) {
  return useOperation((ds, { id, patch }: { id: ID; patch: EntityPatch<Meeting> }) => ds.repo('meetings').update(id, patch), {
    invalidates: ['meetings'],
    success: message,
  });
}

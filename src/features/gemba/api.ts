import { useOperation } from '@/hooks/useData';
import { createAction } from '@/features/actions/api';
import { PRIORITY_BY_SEVERITY } from '@/features/actions/model';
import { ValidationError } from '@/services/errors';
import type { NewEntity } from '@/services/data/types';
import type { DateKey, GembaWalk, ID, User } from '@/types/domain';
import { truncate } from '@/utils/format';
import { validationErrors } from './model';

export interface PlannedAction {
  observationId: ID;
  assigneeId: ID;
  dueDate: DateKey;
}

export type GembaDraft = Omit<NewEntity<GembaWalk>, 'status' | 'validatedAt' | 'closedAt'>;

/** Enregistre un brouillon (création ou mise à jour). */
export function useSaveGembaDraft() {
  return useOperation(
    (ds, { id, draft }: { id?: ID; draft: GembaDraft }) =>
      id ? ds.repo('gembaWalks').update(id, { ...draft, status: 'draft' }) : ds.repo('gembaWalks').create({ ...draft, status: 'draft' }),
    { invalidates: ['gembaWalks'], success: 'Brouillon enregistré.' },
  );
}

/** Valide la marche et crée les actions correctives choisies, liées aux observations. */
export function useValidateGemba() {
  return useOperation(
    async (ds, { id, draft, planned, user }: { id?: ID; draft: GembaDraft; planned: PlannedAction[]; user: User }) => {
      const errors = validationErrors(draft);
      if (errors.length) throw new ValidationError(errors.join(' '));
      const now = new Date().toISOString();
      const walk = id
        ? await ds.repo('gembaWalks').update(id, { ...draft, status: 'validated', validatedAt: now })
        : await ds.repo('gembaWalks').create({ ...draft, status: 'validated', validatedAt: now });

      const observations = [...walk.observations];
      for (const plan of planned) {
        const index = observations.findIndex((o) => o.id === plan.observationId);
        const obs = observations[index];
        if (!obs || obs.actionId) continue;
        const action = await createAction(
          ds,
          {
            title: `Gemba ${walk.zone} : ${truncate(obs.improvement.trim() || obs.finding, 110)}`,
            description: `Constat : ${obs.finding}\nAmélioration proposée : ${obs.improvement}`,
            assigneeId: plan.assigneeId,
            priority: PRIORITY_BY_SEVERITY[obs.severity],
            dueDate: plan.dueDate,
            source: { type: 'gemba', id: walk.id },
          },
          user,
        );
        observations[index] = { ...obs, actionId: action.id };
      }
      return planned.length ? ds.repo('gembaWalks').update(walk.id, { observations }) : walk;
    },
    { invalidates: ['gembaWalks', 'actions', 'notifications'], success: 'Gemba Walk validée.' },
  );
}

export function useCloseGemba() {
  return useOperation((ds, id: ID) => ds.repo('gembaWalks').update(id, { status: 'closed', closedAt: new Date().toISOString() }), {
    invalidates: ['gembaWalks'],
    success: 'Gemba Walk clôturée.',
  });
}

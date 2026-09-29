import { useOperation } from '@/hooks/useData';
import { notify } from '@/features/notifications/api';
import type { DataSource, EntityPatch, NewEntity } from '@/services/data/types';
import type { Action, ActionStatus, Comment, CommentTarget, ID, User } from '@/types/domain';
import { truncate } from '@/utils/format';

export type ActionInput = Omit<NewEntity<Action>, 'status' | 'createdBy' | 'closedAt'> & { status?: ActionStatus };

/** Crée une action et notifie le responsable et le suppléant. */
export async function createAction(ds: DataSource, input: ActionInput, creator: User): Promise<Action> {
  const action = await ds.repo('actions').create({ ...input, status: input.status ?? 'todo', createdBy: creator.id });
  await notify(
    ds,
    [action.assigneeId, action.backupId],
    { kind: 'action_assigned', title: `Nouvelle action : ${truncate(action.title, 80)}`, link: `/actions/${action.id}` },
    creator.id,
  );
  return action;
}

export function useCreateAction() {
  return useOperation((ds, { input, creator }: { input: ActionInput; creator: User }) => createAction(ds, input, creator), {
    invalidates: ['actions', 'notifications'],
    success: 'Action créée — le responsable est notifié.',
  });
}

export function useUpdateAction() {
  return useOperation(
    async (ds, { action, patch, actor }: { action: Action; patch: EntityPatch<Action>; actor: User }) => {
      const next: EntityPatch<Action> = { ...patch };
      if (patch.status && patch.status !== action.status) {
        next.closedAt = patch.status === 'done' ? new Date().toISOString() : undefined;
      }
      const updated = await ds.repo('actions').update(action.id, next);
      if (patch.assigneeId && patch.assigneeId !== action.assigneeId) {
        await notify(
          ds,
          [patch.assigneeId],
          { kind: 'action_assigned', title: `Action réassignée : ${truncate(action.title, 80)}`, link: `/actions/${action.id}` },
          actor.id,
        );
      }
      return updated;
    },
    { invalidates: ['actions', 'notifications'], success: (a) => STATUS_MESSAGE[a.status] },
  );
}

const STATUS_MESSAGE: Record<ActionStatus, string> = {
  todo: 'Action enregistrée.',
  in_progress: 'Action en cours.',
  blocked: 'Action signalée bloquée.',
  done: 'Action terminée.',
  cancelled: 'Action annulée.',
};

/* ---------- Commentaires ---------- */

export function useAddComment() {
  return useOperation(
    async (
      ds,
      {
        targetType,
        targetId,
        anchorId,
        text,
        author,
        notifyUserIds,
        title,
        link,
      }: {
        targetType: CommentTarget;
        targetId: ID;
        anchorId?: ID;
        text: string;
        author: User;
        notifyUserIds: (ID | undefined)[];
        title: string;
        link: string;
      },
    ): Promise<Comment> => {
      const comment = await ds.repo('comments').create({ targetType, targetId, anchorId, authorId: author.id, text: text.trim() });
      await notify(
        ds,
        notifyUserIds,
        { kind: 'comment_added', title: `Commentaire de ${author.name} sur « ${truncate(title, 60)} »`, link },
        author.id,
      );
      return comment;
    },
    { invalidates: ['comments', 'notifications'], success: 'Commentaire publié.' },
  );
}

export function useEditComment() {
  return useOperation(
    (ds, { id, text }: { id: ID; text: string }) =>
      ds.repo('comments').update(id, { text: text.trim(), editedAt: new Date().toISOString() }),
    { invalidates: ['comments'], success: 'Commentaire modifié.' },
  );
}

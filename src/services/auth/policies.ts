import type { Action, Comment, Meeting, User } from '@/types/domain';
import { roleCan, type Permission } from './permissions';

/* Règles d'autorisation qui dépendent d'une ressource (docs/permission-matrix.md §2).
   can(user, permission) : droit du rôle.
   can(user, permission, ressource) : droit du rôle ET règle propre à la ressource. */

export type PolicyResource =
  { type: 'action'; action: Action } | { type: 'meeting'; meeting: Meeting } | { type: 'comment'; comment: Comment };

/** Utilisateur invité à une réunion, directement ou via son équipe. */
export const isMeetingParticipant = (meeting: Meeting, user: User) =>
  meeting.organizerId === user.id ||
  meeting.participantIds.includes(user.id) ||
  Boolean(user.teamId && (meeting.teamIds ?? []).includes(user.teamId));

export function can(user: User | null | undefined, permission: Permission, resource?: PolicyResource): boolean {
  if (!user || !user.active) return false;
  const role = (p: Permission) => roleCan(user.role, p);
  if (!resource) return role(permission);

  switch (resource.type) {
    case 'action': {
      const a = resource.action;
      if (permission !== 'action.update') return role(permission);
      // Mettre à jour une action : responsable, suppléant, créateur, ou gestion de toutes les actions
      return role('action.manage') || (role('action.update') && [a.assigneeId, a.backupId, a.createdBy].includes(user.id));
    }
    case 'meeting': {
      const m = resource.meeting;
      if (permission === 'meeting.run') return role('meeting.manage') || m.organizerId === user.id;
      if (permission === 'meeting.view') return role('meeting.manage') || role('space.supervision') || isMeetingParticipant(m, user);
      return role(permission);
    }
    case 'comment':
      // Seul l'auteur modifie son commentaire
      return role(permission) && resource.comment.authorId === user.id;
  }
}

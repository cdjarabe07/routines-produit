import type { Tone } from '@/components/ui/Badge';
import type { DateKey, Leave, PresenceRecord, Shift, User } from '@/types/domain';

export type MemberStatus = 'on_leave' | 'present' | 'absent' | 'unknown';

export const MEMBER_STATUS: Record<MemberStatus, { label: string; tone: Tone }> = {
  present: { label: 'Présent', tone: 'success' },
  absent: { label: 'Absent', tone: 'danger' },
  on_leave: { label: 'En congé', tone: 'warning' },
  unknown: { label: 'Non renseigné', tone: 'neutral' },
};

export const activeLeave = (leaves: Leave[], userId: string, date: DateKey) =>
  leaves.find((l) => l.userId === userId && l.from <= date && l.to >= date);

/**
 * Statut du jour : le congé est CALCULÉ (prioritaire) et n'écrase jamais la présence saisie.
 * À la fin du congé, la personne redevient « non renseignée » (bug du prototype corrigé).
 */
export function memberStatus(userId: string, date: DateKey, presence: PresenceRecord[], leaves: Leave[]): MemberStatus {
  if (activeLeave(leaves, userId, date)) return 'on_leave';
  const record = presence.find((p) => p.userId === userId && p.date === date);
  return record ? record.status : 'unknown';
}

export const NEXT_SHIFT: Record<Shift, Shift> = { morning: 'afternoon', afternoon: 'night', night: 'morning' };

export const teamMembers = (users: User[]) => users.filter((u) => u.active && u.role !== 'admin');

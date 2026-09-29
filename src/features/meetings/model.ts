import type { Tone } from '@/components/ui/Badge';
import { isMeetingParticipant } from '@/services/auth/policies';
import type { DateKey, EventType, Meeting, User } from '@/types/domain';
import { timeToMinutes } from '@/utils/date';

export const MEETING_STATUS: Record<Meeting['status'], { label: string; tone: Tone }> = {
  planned: { label: 'Planifiée', tone: 'neutral' },
  in_progress: { label: 'En cours', tone: 'info' },
  done: { label: 'Terminée', tone: 'success' },
  cancelled: { label: 'Annulée', tone: 'neutral' },
};

export const DEFAULT_AGENDA = [
  'Sécurité et 5S',
  'Production / OF du jour',
  'Qualité et anomalies',
  'Effectifs et absences',
  'Suivi des actions',
];

/** Types d'événements qui se tiennent avec ordre du jour, présences et compte-rendu. */
export const hasMinutes = (type: EventType) => type === 'meeting' || type === 'briefing' || type === 'daily';

export const durationMinutes = (m: Pick<Meeting, 'startTime' | 'endTime'>) =>
  Math.max(0, timeToMinutes(m.endTime) - timeToMinutes(m.startTime));

/** Événements auxquels la personne est invitée (directement, via son équipe, ou comme responsable). */
export const meetingsForUser = (meetings: Meeting[], user: User) => meetings.filter((m) => isMeetingParticipant(m, user));

/** Prochain événement non annulé à partir d'un instant. */
export function nextMeeting(meetings: Meeting[], today: DateKey, nowMinutes: number): Meeting | undefined {
  return meetings
    .filter(
      (m) =>
        m.status !== 'cancelled' && m.status !== 'done' && (m.date > today || (m.date === today && timeToMinutes(m.endTime) >= nowMinutes)),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))[0];
}

/** Invités effectifs : invités directs + membres des équipes invitées + responsable. */
export function invitedUserIds(m: Meeting, users: User[]): string[] {
  const ids = new Set([m.organizerId, ...m.participantIds]);
  for (const u of users) if (u.active && u.teamId && m.teamIds.includes(u.teamId)) ids.add(u.id);
  return Array.from(ids);
}

import type { DateKey, Meeting, RoutineRun, RoutineTemplate } from '@/types/domain';
import { findRun, runProgress } from '@/features/routines/model';

export interface AgendaEntry {
  id: string;
  time: string;
  title: string;
  kind: 'routine' | 'meeting';
  detail: string;
  done: boolean;
  to: string;
}

/** Agenda d'une journée : routines planifiées et réunions, triées par heure. */
export function buildDayAgenda(date: DateKey, templates: RoutineTemplate[], runs: RoutineRun[], meetings: Meeting[]): AgendaEntry[] {
  const routineEntries: AgendaEntry[] = templates
    .filter((t) => t.active)
    .map((t) => {
      const p = runProgress(t, findRun(runs, t.id, date));
      return {
        id: `r-${t.id}`,
        time: t.scheduledTime,
        title: t.title,
        kind: 'routine',
        detail: `Routine · ${p.treated}/${p.total} points`,
        done: p.total > 0 && p.treated === p.total,
        to: `/routines/${t.id}/${date}`,
      };
    });
  const meetingEntries: AgendaEntry[] = meetings
    .filter((m) => m.date === date)
    .map((m) => ({
      id: `m-${m.id}`,
      time: m.startTime,
      title: m.title,
      kind: 'meeting',
      detail: `Réunion · ${m.durationMin} min · ${m.participantIds.length} présent(s)`,
      done: m.status === 'done',
      to: `/reunions/${m.id}`,
    }));
  return [...routineEntries, ...meetingEntries].sort((a, b) => a.time.localeCompare(b.time));
}

export const MEETING_STATUS = {
  planned: { label: 'Planifiée', tone: 'neutral' },
  in_progress: { label: 'En cours', tone: 'info' },
  done: { label: 'Terminée', tone: 'success' },
} as const;

export const DEFAULT_AGENDA = [
  'Sécurité et 5S',
  'Production / OF du jour',
  'Qualité et anomalies',
  'Effectifs et absences',
  'Suivi des actions',
];

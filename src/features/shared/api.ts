import { useMemo } from 'react';
import { useCollection } from '@/hooks/useData';
import type { AppSettings, Line, Team, User, Workstation } from '@/types/domain';

export const DEFAULT_SETTINGS: Omit<AppSettings, 'id' | 'createdAt' | 'updatedAt'> = {
  plantName: 'Mon atelier',
  andonEscalationMinutes: 10,
  routineLateToleranceMinutes: 120,
};

/** Paramètres de l'application (valeurs par défaut si non configurés). */
export function useSettings() {
  const query = useCollection('settings');
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...(query.data?.[0] ?? {}) }), [query.data]);
  return { ...query, settings };
}

export interface Lookups {
  users: User[];
  activeUsers: User[];
  userById: Map<string, User>;
  teams: Team[];
  teamById: Map<string, Team>;
  workstations: Workstation[];
  workstationById: Map<string, Workstation>;
  lines: Line[];
  lineById: Map<string, Line>;
  userName: (id?: string) => string;
  teamName: (id?: string) => string;
  lineName: (id?: string) => string;
  workstationName: (id?: string) => string;
  /** Membres actifs d'une équipe */
  teamMembers: (teamId?: string) => User[];
}

/** Référentiels communs, indexés pour l'affichage. */
export function useLookups() {
  const users = useCollection('users');
  const teams = useCollection('teams');
  const workstations = useCollection('workstations');
  const lines = useCollection('lines');

  const lookups = useMemo<Lookups | null>(() => {
    if (!users.data || !teams.data || !workstations.data || !lines.data) return null;
    const userById = new Map(users.data.map((u) => [u.id, u]));
    const teamById = new Map(teams.data.map((t) => [t.id, t]));
    const workstationById = new Map(workstations.data.map((w) => [w.id, w]));
    const lineById = new Map(lines.data.map((l) => [l.id, l]));
    const sortedWs = [...workstations.data].sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
    const activeUsers = users.data.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return {
      users: users.data,
      activeUsers,
      userById,
      teams: [...teams.data].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      teamById,
      workstations: sortedWs,
      workstationById,
      lines: lines.data,
      lineById,
      userName: (id) => (id ? (userById.get(id)?.name ?? 'Utilisateur inconnu') : '—'),
      teamName: (id) => (id ? (teamById.get(id)?.name ?? 'Équipe inconnue') : '—'),
      lineName: (id) => (id ? (lineById.get(id)?.name ?? 'Ligne inconnue') : '—'),
      workstationName: (id) => (id ? (workstationById.get(id)?.name ?? 'Poste inconnu') : '—'),
      teamMembers: (teamId) => (teamId ? activeUsers.filter((u) => u.teamId === teamId) : []),
    };
  }, [users.data, teams.data, workstations.data, lines.data]);

  return { queries: [users, teams, workstations, lines], lookups };
}

export const userOptions = (users: User[]) => users.map((u) => ({ value: u.id, label: u.name }));
export const workstationOptions = (ws: Workstation[]) => ws.map((w) => ({ value: w.id, label: w.name }));
export const teamOptions = (teams: Team[]) => teams.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name }));
export const lineOptions = (lines: Line[]) => lines.map((l) => ({ value: l.id, label: l.name }));

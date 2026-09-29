import { useMemo } from 'react';
import { useCollection } from '@/hooks/useData';
import type { AppSettings, Line, User, Workstation } from '@/types/domain';

export const DEFAULT_SETTINGS: Omit<AppSettings, 'id' | 'createdAt' | 'updatedAt'> = {
  plantName: 'Atelier de câblage',
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
  workstations: Workstation[];
  workstationById: Map<string, Workstation>;
  lines: Line[];
  lineById: Map<string, Line>;
  userName: (id?: string) => string;
  workstationName: (id?: string) => string;
}

/** Référentiels communs, indexés pour l'affichage. */
export function useLookups() {
  const users = useCollection('users');
  const workstations = useCollection('workstations');
  const lines = useCollection('lines');

  const lookups = useMemo<Lookups | null>(() => {
    if (!users.data || !workstations.data || !lines.data) return null;
    const userById = new Map(users.data.map((u) => [u.id, u]));
    const workstationById = new Map(workstations.data.map((w) => [w.id, w]));
    const sortedWs = [...workstations.data].sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
    return {
      users: users.data,
      activeUsers: users.data.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      userById,
      workstations: sortedWs,
      workstationById,
      lines: lines.data,
      lineById: new Map(lines.data.map((l) => [l.id, l])),
      userName: (id) => (id ? (userById.get(id)?.name ?? 'Utilisateur inconnu') : '—'),
      workstationName: (id) => (id ? (workstationById.get(id)?.name ?? 'Poste inconnu') : '—'),
    };
  }, [users.data, workstations.data, lines.data]);

  return { queries: [users, workstations, lines], lookups };
}

export const userOptions = (users: User[]) => users.map((u) => ({ value: u.id, label: u.name }));
export const workstationOptions = (ws: Workstation[]) => ws.map((w) => ({ value: w.id, label: w.name }));

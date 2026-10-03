import { useQueryClient } from '@tanstack/react-query';
import { useDataSource } from '@/app/providers/DataSourceProvider';
import { useToast } from '@/components/ui/Toast';
import { useOperation } from '@/hooks/useData';
import { DEFAULT_SETTINGS } from '@/features/shared/api';
import { toUserMessage, ValidationError } from '@/services/errors';
import type { NewEntity } from '@/services/data/types';
import type { AppSettings, ID, Team, User, Workstation } from '@/types/domain';

export function useSaveUser() {
  return useOperation(
    async (ds, { id, input }: { id?: ID; input: NewEntity<User> }): Promise<{ user: User; temporaryPassword?: string }> => {
      const email = input.email.trim().toLowerCase();
      const duplicate = (await ds.repo('users').list()).some((u) => u.email.toLowerCase() === email && u.id !== id);
      if (duplicate) throw new ValidationError('Un utilisateur utilise déjà cette adresse email.');
      // Rattachement à une équipe : le quart et la ligne sont repris de l'équipe (docs/role-model.md §3)
      const team = input.teamId ? await ds.repo('teams').get(input.teamId) : undefined;
      const payload = { ...input, email, shift: team?.shift ?? input.shift, lineId: team ? (team.lineId ?? input.lineId) : input.lineId };
      if (ds.accounts) {
        // Comptes serveur : création du compte d'authentification par l'API d'administration ; email et
        // dernière connexion gérés par le serveur
        if (!id) return ds.accounts.create(payload);
        const editable: Partial<NewEntity<User>> = { ...payload };
        delete editable.email;
        delete editable.lastSignInAt;
        return { user: await ds.repo('users').update(id, editable) };
      }
      return { user: id ? await ds.repo('users').update(id, payload) : await ds.repo('users').create(payload) };
    },
    { invalidates: ['users'], success: (r) => (r.temporaryPassword ? 'Compte créé.' : 'Utilisateur enregistré.') },
  );
}

/** Nouveau mot de passe provisoire (sessions en cours révoquées). Comptes serveur uniquement. */
export function useResetUserPassword() {
  return useOperation(
    async (ds, userId: ID) => {
      if (!ds.accounts) throw new ValidationError('Réinitialisation indisponible avec les comptes de démonstration locaux.');
      return ds.accounts.resetPassword(userId);
    },
    { invalidates: ['notifications'], success: 'Mot de passe réinitialisé.' },
  );
}

/** Enregistre une équipe et ses membres (le quart et la ligne des membres suivent l'équipe). */
export function useSaveTeam() {
  return useOperation(
    async (ds, { id, input, memberIds }: { id?: ID; input: NewEntity<Team>; memberIds: ID[] }) => {
      const name = input.name.trim();
      const duplicate = (await ds.repo('teams').list()).some((t) => t.name.toLowerCase() === name.toLowerCase() && t.id !== id);
      if (duplicate) throw new ValidationError('Une équipe porte déjà ce nom.');
      const team = id ? await ds.repo('teams').update(id, { ...input, name }) : await ds.repo('teams').create({ ...input, name });
      const users = await ds.repo('users').list();
      const wanted = new Set(memberIds);
      await Promise.all(
        users.map((u) => {
          if (wanted.has(u.id))
            return ds.repo('users').update(u.id, { teamId: team.id, shift: team.shift ?? u.shift, lineId: team.lineId ?? u.lineId });
          if (u.teamId === team.id) return ds.repo('users').update(u.id, { teamId: undefined });
          return null;
        }),
      );
      return team;
    },
    { invalidates: ['teams', 'users'], success: 'Équipe enregistrée.' },
  );
}

export function useSetTeamActive() {
  return useOperation(
    async (ds, { id, active }: { id: ID; active: boolean }) => {
      if (!active) {
        const planned = (await ds.repo('schedules').list({ where: { teamId: id } })).filter((s) => s.status === 'active');
        if (planned.length)
          throw new ValidationError(
            `${planned.length} planification(s) active(s) sont affectées à cette équipe : réaffectez-les avant de la désactiver.`,
          );
      }
      return ds.repo('teams').update(id, { active });
    },
    { invalidates: ['teams'], success: (t) => (t.active ? 'Équipe réactivée.' : 'Équipe désactivée.') },
  );
}

export function useSaveWorkstation() {
  return useOperation(
    async (ds, { id, input }: { id?: ID; input: NewEntity<Workstation> }) => {
      const code = input.code.trim().toUpperCase();
      const duplicate = (await ds.repo('workstations').list()).some((w) => w.code.toUpperCase() === code && w.id !== id);
      if (duplicate) throw new ValidationError(`Le code ${code} est déjà utilisé : les QR codes doivent être uniques.`);
      const payload = { ...input, code };
      return id ? ds.repo('workstations').update(id, payload) : ds.repo('workstations').create(payload);
    },
    { invalidates: ['workstations'], success: 'Poste enregistré.' },
  );
}

export function useSaveSettings() {
  return useOperation(
    async (ds, input: Omit<AppSettings, 'id' | 'createdAt' | 'updatedAt'>) => {
      const existing = (await ds.repo('settings').list())[0];
      return existing ? ds.repo('settings').update(existing.id, input) : ds.repo('settings').create({ id: 'app', ...input });
    },
    { invalidates: ['settings'], success: 'Paramètres enregistrés.' },
  );
}

/** Modules masqués (src/app/modules.ts) : aucune donnée n'est supprimée */
export function useSaveModules() {
  return useOperation(
    async (ds, disabledModules: string[]) => {
      const existing = (await ds.repo('settings').list())[0];
      return existing
        ? ds.repo('settings').update(existing.id, { disabledModules })
        : ds.repo('settings').create({ id: 'app', ...DEFAULT_SETTINGS, disabledModules });
    },
    { invalidates: ['settings'], success: 'Modules enregistrés.' },
  );
}

/** Réinitialisation de l'environnement local (source de données « navigateur » uniquement). */
export function useResetDemoData() {
  const ds = useDataSource();
  const client = useQueryClient();
  const toast = useToast();
  return async () => {
    if (!ds.resetDemoData) {
      toast.error('Réinitialisation impossible : les données sont servies par l’API.');
      return;
    }
    try {
      await ds.resetDemoData();
      await client.invalidateQueries();
      toast.success('Environnement réinitialisé.');
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };
}

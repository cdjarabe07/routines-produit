import { useQueryClient } from '@tanstack/react-query';
import { useDataSource } from '@/app/providers/DataSourceProvider';
import { useToast } from '@/components/ui/Toast';
import { useOperation } from '@/hooks/useData';
import { toUserMessage, ValidationError } from '@/services/errors';
import type { NewEntity } from '@/services/data/types';
import type { AppSettings, ID, User, Workstation } from '@/types/domain';

export function useSaveUser() {
  return useOperation(
    async (ds, { id, input }: { id?: ID; input: NewEntity<User> }) => {
      const email = input.email.trim().toLowerCase();
      const duplicate = (await ds.repo('users').list()).some((u) => u.email.toLowerCase() === email && u.id !== id);
      if (duplicate) throw new ValidationError('Un utilisateur utilise déjà cette adresse email.');
      const payload = { ...input, email };
      return id ? ds.repo('users').update(id, payload) : ds.repo('users').create(payload);
    },
    { invalidates: ['users'], success: 'Utilisateur enregistré.' },
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

/** Réinitialisation complète des données de démonstration (mode DÉMO uniquement). */
export function useResetDemoData() {
  const ds = useDataSource();
  const client = useQueryClient();
  const toast = useToast();
  return async () => {
    if (!ds.resetDemoData) {
      toast.error('Réinitialisation impossible : l’application n’est pas en mode démonstration.');
      return;
    }
    try {
      await ds.resetDemoData();
      await client.invalidateQueries();
      toast.success('Données de démonstration rechargées.');
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };
}

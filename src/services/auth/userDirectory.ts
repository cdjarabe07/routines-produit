import type { DataSource } from '@/services/data/types';
import type { User } from '@/types/domain';
import { roleCan } from './permissions';
import type { UserDirectory } from './mock/mockAuthProvider';

/** Annuaire des utilisateurs adossé à la couche de données (utilisé par le fournisseur simulé). */
export function createUserDirectory(ds: DataSource): UserDirectory {
  return {
    listUsers: () => ds.repo('users').list(),
    async recordSignIn(userId) {
      await ds.repo('users').update(userId, { lastSignInAt: new Date().toISOString() });
    },
    async notifyAccessRequest(user: User) {
      const admins = (await ds.repo('users').list()).filter((u) => u.active && roleCan(u.role, 'user.manage'));
      await Promise.all(
        admins.map((admin) =>
          ds.repo('notifications').create({
            userId: admin.id,
            kind: 'access_request',
            title: `Mot de passe oublié : ${user.name} demande une réinitialisation`,
            link: `/admin/utilisateurs?utilisateur=${user.id}`,
          }),
        ),
      );
    },
  };
}

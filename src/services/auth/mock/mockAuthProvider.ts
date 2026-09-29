import { AuthenticationError } from '@/services/errors';
import { createLogger } from '@/services/logger';
import type { User } from '@/types/domain';
import type { AuthService, Session } from '../authService';
import { MOCK_AUTH } from './accounts';

/* Fournisseur simulé : vérifie l'identifiant et le mot de passe contre l'annuaire local.
   Utilisé pendant le développement ; remplacé par un fournisseur réel derrière AuthService. */

const SESSION_KEY = 'ra:session';
const log = createLogger('auth:mock');

/** Accès à l'annuaire des utilisateurs, fourni par la couche de données. */
export interface UserDirectory {
  listUsers(): Promise<User[]>;
  recordSignIn(userId: string): Promise<void>;
  /** Prévient les administrateurs d'une demande d'accès (mot de passe oublié). */
  notifyAccessRequest(user: User): Promise<void>;
}

type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const normalize = (value: string) => value.trim().toLowerCase();

function findUser(users: User[], identifier: string): User | undefined {
  const id = normalize(identifier);
  const aliasId = MOCK_AUTH.aliases[id];
  return users.find((u) => (aliasId ? u.id === aliasId : normalize(u.email) === id || normalize(u.email).split('@')[0] === id));
}

export function createMockAuthProvider(storage: SessionStorage, directory: UserDirectory): AuthService {
  return {
    mode: 'demo',
    available: true,
    getSession() {
      try {
        const raw = storage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw) as Session;
        if (Date.now() - new Date(session.startedAt).getTime() > MOCK_AUTH.sessionTtlMs) {
          storage.removeItem(SESSION_KEY);
          return null;
        }
        return session;
      } catch {
        return null;
      }
    },
    async signIn({ identifier, password }) {
      const user = findUser(await directory.listUsers(), identifier);
      if (!user || password !== MOCK_AUTH.password) throw new AuthenticationError();
      if (!user.active) throw new AuthenticationError('Ce compte est désactivé. Contactez votre administrateur.');
      const session: Session = { userId: user.id, startedAt: new Date().toISOString(), mode: 'demo' };
      storage.setItem(SESSION_KEY, JSON.stringify(session));
      await directory.recordSignIn(user.id).catch((error: unknown) => log.warn('Dernière activité non enregistrée', error));
      return session;
    },
    async signOut() {
      storage.removeItem(SESSION_KEY);
    },
    async requestPasswordReset(identifier) {
      const user = findUser(await directory.listUsers(), identifier);
      // Même réponse que le compte existe ou non : on ne révèle pas l'annuaire
      if (user?.active) await directory.notifyAccessRequest(user);
    },
    getAccessToken: () => null,
  };
}

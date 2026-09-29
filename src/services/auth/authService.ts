import type { ID, ISODateTime } from '@/types/domain';
import type { AuthMode } from '@/app/config/env';

/* Contrat d'authentification, indépendant de l'UI.
   - DemoAuthService : choix d'un profil, AUCUNE vérification d'identité.
   - Fournisseur réel (Entra ID / OIDC) : à implémenter derrière la même interface (docs/deployment.md). */

export interface Session {
  userId: ID;
  startedAt: ISODateTime;
  mode: AuthMode;
}

export interface AuthService {
  readonly mode: AuthMode;
  /** true si le fournisseur est opérationnel dans cette configuration */
  readonly available: boolean;
  getSession(): Session | null;
  signIn(credentials: { userId: ID }): Promise<Session>;
  signOut(): Promise<void>;
  getAccessToken(): string | null;
}

const SESSION_KEY = 'ra:session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function createDemoAuthService(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): AuthService {
  return {
    mode: 'demo',
    available: true,
    getSession() {
      try {
        const raw = storage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw) as Session;
        if (Date.now() - new Date(session.startedAt).getTime() > SESSION_TTL_MS) {
          storage.removeItem(SESSION_KEY);
          return null;
        }
        return session;
      } catch {
        return null;
      }
    },
    async signIn({ userId }) {
      const session: Session = { userId, startedAt: new Date().toISOString(), mode: 'demo' };
      storage.setItem(SESSION_KEY, JSON.stringify(session));
      return session;
    },
    async signOut() {
      storage.removeItem(SESSION_KEY);
    },
    getAccessToken: () => null,
  };
}

/** Fournisseur non branché : l'application refuse l'accès et explique quoi configurer. */
export function createUnconfiguredAuthService(mode: AuthMode): AuthService {
  return {
    mode,
    available: false,
    getSession: () => null,
    signIn: async () => {
      throw new Error('Fournisseur d’authentification non configuré');
    },
    signOut: async () => undefined,
    getAccessToken: () => null,
  };
}

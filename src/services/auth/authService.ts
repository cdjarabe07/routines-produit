import type { ID, ISODateTime } from '@/types/domain';
import type { AuthMode } from '@/app/config/env';

/* Contrat d'authentification, indépendant de l'interface.

     Écran de connexion
            ↓
       AuthService              ← ce contrat
            ↓
   MockAuthProvider             ← mock/mockAuthProvider.ts (développement, NON sécurisé)
   Fournisseur réel (OIDC)      ← à brancher ici (docs/deployment.md), sans toucher à l'interface */

export interface Session {
  userId: ID;
  startedAt: ISODateTime;
  mode: AuthMode;
}

export interface Credentials {
  /** Identifiant court ou adresse email */
  identifier: string;
  password: string;
}

export interface AuthService {
  readonly mode: AuthMode;
  /** true si le fournisseur est opérationnel dans cette configuration */
  readonly available: boolean;
  getSession(): Session | null;
  /** Rejette une AuthenticationError si les identifiants sont refusés. */
  signIn(credentials: Credentials): Promise<Session>;
  signOut(): Promise<void>;
  /** Transmet une demande de réinitialisation. Ne révèle jamais si le compte existe. */
  requestPasswordReset(identifier: string): Promise<void>;
  getAccessToken(): string | null;
}

/** Fournisseur non branché : l'application refuse l'accès et explique quoi configurer. */
export function createUnconfiguredAuthService(mode: AuthMode): AuthService {
  const refuse = async () => {
    throw new Error('Fournisseur d’authentification non configuré');
  };
  return {
    mode,
    available: false,
    getSession: () => null,
    signIn: refuse,
    signOut: async () => undefined,
    requestPasswordReset: refuse,
    getAccessToken: () => null,
  };
}

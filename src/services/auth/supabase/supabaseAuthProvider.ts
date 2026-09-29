import type { Session as AuthSession, SupabaseClient } from '@supabase/supabase-js';
import { AuthenticationError, NetworkError, ValidationError } from '@/services/errors';
import { createLogger } from '@/services/logger';
import type { AuthService, Session } from '../authService';

/* Authentification réelle (Supabase Auth) : mots de passe hachés côté serveur (bcrypt), jeton d'accès signé d'une heure,
   jeton de rafraîchissement à rotation. Le navigateur ne décide de rien : l'identité et le rôle sont relus
   par la base à chaque requête (auth.uid() → users.authId). */

const log = createLogger('auth:supabase');
const MIN_PASSWORD = 12;

export function createSupabaseAuthProvider(client: SupabaseClient, options: { emailDomain?: string | null } = {}): AuthService {
  let session: Session | null = null;
  let accessToken: string | null = null;
  const listeners = new Set<() => void>();

  /** Compte applicatif lié au compte d'authentification (lecture autorisée par la RLS pour soi-même). */
  async function resolve(auth: AuthSession | null): Promise<Session | null> {
    if (!auth) return null;
    const { data, error } = await client.from('users').select('id, active').eq('authId', auth.user.id).maybeSingle();
    if (error) {
      log.error('Profil introuvable', error);
      return null;
    }
    if (!data?.active) return null;
    return { userId: data.id as string, startedAt: new Date().toISOString(), mode: 'supabase' };
  }

  function toEmail(identifier: string): string {
    const id = identifier.trim().toLowerCase();
    if (id.includes('@')) return id;
    if (!options.emailDomain) throw new AuthenticationError('Saisissez votre adresse email.');
    return `${id}@${options.emailDomain}`;
  }

  client.auth.onAuthStateChange((event, next) => {
    accessToken = next?.access_token ?? null;
    // Session révoquée ou expirée (mot de passe réinitialisé, compte désactivé) : retour à l'écran de connexion
    if (event === 'SIGNED_OUT' && session) {
      session = null;
      listeners.forEach((l) => l());
    }
  });

  return {
    mode: 'supabase',
    available: true,
    async init() {
      const { data } = await client.auth.getSession();
      accessToken = data.session?.access_token ?? null;
      session = await resolve(data.session);
      if (data.session && !session) await client.auth.signOut({ scope: 'local' });
      return session;
    },
    getSession: () => session,
    onSessionEnded(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signIn({ identifier, password }) {
      const { data, error } = await client.auth.signInWithPassword({ email: toEmail(identifier), password });
      if (error) {
        log.warn('Connexion refusée', { status: error.status, code: error.code });
        if (error.code === 'user_banned') throw new AuthenticationError('Ce compte est désactivé. Contactez votre administrateur.');
        if (error.status === 429) throw new AuthenticationError('Trop de tentatives. Patientez quelques minutes avant de réessayer.');
        if (!error.status) throw new NetworkError(error);
        throw new AuthenticationError();
      }
      const next = await resolve(data.session);
      if (!next) {
        await client.auth.signOut({ scope: 'local' });
        throw new AuthenticationError('Ce compte est désactivé. Contactez votre administrateur.');
      }
      session = next;
      accessToken = data.session.access_token;
      // Horodatage et audit de connexion écrits par le serveur
      const { error: rpcError } = await client.rpc('record_sign_in');
      if (rpcError) log.warn('Connexion non journalisée', rpcError);
      return next;
    },
    async signOut() {
      if (session) {
        const { error } = await client.rpc('record_sign_out');
        if (error) log.warn('Déconnexion non journalisée', error);
      }
      session = null;
      accessToken = null;
      // Révoque aussi le jeton de rafraîchissement côté serveur
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) log.warn('Révocation de session', error);
    },
    async requestPasswordReset(identifier) {
      // Prévient les administrateurs (même réponse que le compte existe ou non, débit limité côté serveur)
      const { error } = await client.rpc('request_access_help', { p_identifier: identifier.trim().slice(0, 254) });
      if (error) log.warn('Demande d’aide non transmise', error);
    },
    async changePassword(current, next) {
      if (next.length < MIN_PASSWORD) throw new ValidationError(`Le mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.`);
      const { data } = await client.auth.getUser();
      const email = data.user?.email;
      if (!email) throw new AuthenticationError('Session expirée. Reconnectez-vous.');
      // Le mot de passe actuel est revérifié : une session laissée ouverte ne suffit pas à le changer
      const check = await client.auth.signInWithPassword({ email, password: current });
      if (check.error) throw new AuthenticationError('Mot de passe actuel incorrect.');
      const { error } = await client.auth.updateUser({ password: next });
      if (error) {
        log.warn('Changement de mot de passe refusé', error.code);
        throw new ValidationError(
          error.code === 'weak_password' ? 'Mot de passe trop faible : choisissez-en un plus long et moins courant.' : 'Changement refusé.',
        );
      }
    },
    getAccessToken: () => accessToken,
  };
}

import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { AccessDenied, LoadingState } from '@/components/feedback/States';
import { homePath, type Permission } from '@/services/auth/permissions';
import { PlantTimeZone } from './PlantTimeZone';
import { useAuth } from './providers/AuthProvider';

/** Accès réservé aux utilisateurs connectés ; sinon redirection vers la connexion (retour prévu). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, signedOutFrom } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <LoadingState label="Ouverture de la session…" />;
  if (status !== 'signedIn') {
    // Retour proposé si la session manque (lien direct, expiration), pas sur la page quittée par « Se déconnecter »
    const from = location.pathname + location.search;
    const back = from !== '/' && signedOutFrom !== `#${from}`;
    return <Navigate to={`/login${back ? `?retour=${encodeURIComponent(from)}` : ''}`} replace />;
  }
  return <PlantTimeZone>{children}</PlantTimeZone>;
}

/** Racine : chaque profil arrive sur son espace (docs/role-model.md §4). */
export function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homePath(user.role) : '/login'} replace />;
}

/** Ancienne adresse : redirige en conservant les paramètres (liens enregistrés, favoris). */
export function LegacyRedirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

/** Garde de route par permission : affiche un état « accès refusé » explicite. */
export function RequirePermission({ permission, children, what }: { permission?: Permission; children: ReactNode; what?: string }) {
  const { can } = useAuth();
  if (permission && !can(permission)) return <AccessDenied what={what} />;
  return <>{children}</>;
}

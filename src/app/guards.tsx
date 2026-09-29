import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { AccessDenied, LoadingState } from '@/components/feedback/States';
import type { Permission } from '@/services/auth/permissions';
import { useAuth } from './providers/AuthProvider';

/** Accès réservé aux utilisateurs connectés ; sinon redirection vers la connexion (retour prévu). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <LoadingState label="Ouverture de la session…" />;
  if (status !== 'signedIn') {
    const from = location.pathname + location.search;
    return <Navigate to={`/connexion${from !== '/' ? `?retour=${encodeURIComponent(from)}` : ''}`} replace />;
  }
  return <>{children}</>;
}

/** Garde de route par permission : affiche un état « accès refusé » explicite. */
export function RequirePermission({ permission, children, what }: { permission?: Permission; children: ReactNode; what?: string }) {
  const { can } = useAuth();
  if (permission && !can(permission)) return <AccessDenied what={what} />;
  return <>{children}</>;
}

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthService, Session } from '@/services/auth/authService';
import { roleCan, type Permission } from '@/services/auth/permissions';
import type { ID, User } from '@/types/domain';
import { useDataSource } from './DataSourceProvider';

interface AuthContextValue {
  service: AuthService;
  session: Session | null;
  user: User | null;
  status: 'unavailable' | 'signedOut' | 'loading' | 'signedIn';
  can: (permission: Permission) => boolean;
  signIn: (userId: ID) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ service, children }: { service: AuthService; children: ReactNode }) {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(() => service.getSession());

  const userQuery = useQuery({
    queryKey: ['session-user', session?.userId],
    queryFn: () => ds.repo('users').get(session!.userId),
    enabled: Boolean(session),
    retry: false,
  });

  const user = userQuery.data && userQuery.data.active ? userQuery.data : null;

  const signIn = useCallback(
    async (userId: ID) => {
      setSession(await service.signIn({ userId }));
    },
    [service],
  );

  const signOut = useCallback(async () => {
    await service.signOut();
    setSession(null);
    queryClient.clear();
  }, [service, queryClient]);

  const value = useMemo<AuthContextValue>(() => {
    const status = !service.available
      ? 'unavailable'
      : !session || userQuery.isError || (userQuery.isSuccess && !user)
        ? 'signedOut'
        : user
          ? 'signedIn'
          : 'loading';
    return {
      service,
      session,
      user,
      status,
      can: (permission) => (user ? roleCan(user.role, permission) : false),
      signIn,
      signOut,
    };
  }, [service, session, user, userQuery.isError, userQuery.isSuccess, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}

/** Utilisateur connecté (garanti dans les pages protégées). */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('Aucun utilisateur connecté');
  return user;
}

/** Affichage conditionnel par permission — seul moyen de masquer un élément selon les droits. */
export function Can({ permission, children, fallback = null }: { permission: Permission; children: ReactNode; fallback?: ReactNode }) {
  const { can } = useAuth();
  return <>{can(permission) ? children : fallback}</>;
}

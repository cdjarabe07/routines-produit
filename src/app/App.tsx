import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { env } from '@/app/config/env';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { DataSourceProvider } from '@/app/providers/DataSourceProvider';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfigErrorScreen } from '@/components/feedback/ConfigErrorScreen';
import { createUnconfiguredAuthService } from '@/services/auth/authService';
import { createMockAuthProvider } from '@/services/auth/mock/mockAuthProvider';
import { createUserDirectory } from '@/services/auth/userDirectory';
import { createDataSource } from '@/services/data/createDataSource';
import { createAppRouter } from './router';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 },
      mutations: { retry: 0 },
    },
  });
}

export function App() {
  const [services] = useState(() => {
    // Le jeton est lu à chaque requête : la source de données peut être créée avant le fournisseur d'authentification
    let getToken: () => string | null = () => null;
    const dataSource = createDataSource(env, () => getToken());
    const auth =
      env.authMode === 'demo'
        ? createMockAuthProvider(window.sessionStorage, createUserDirectory(dataSource))
        : createUnconfiguredAuthService(env.authMode);
    getToken = () => auth.getAccessToken();
    return { auth, dataSource, queryClient: createQueryClient(), router: createAppRouter() };
  });

  if (env.configErrors.length > 0) return <ConfigErrorScreen errors={env.configErrors} />;

  return (
    <QueryClientProvider client={services.queryClient}>
      <DataSourceProvider value={services.dataSource}>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider service={services.auth}>
              <RouterProvider router={services.router} />
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </DataSourceProvider>
    </QueryClientProvider>
  );
}

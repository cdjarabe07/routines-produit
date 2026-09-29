import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { env } from '@/app/config/env';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { DataSourceProvider } from '@/app/providers/DataSourceProvider';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfigErrorScreen } from '@/components/feedback/ConfigErrorScreen';
import { createDemoAuthService, createUnconfiguredAuthService } from '@/services/auth/authService';
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
    const auth = env.authMode === 'demo' ? createDemoAuthService(window.sessionStorage) : createUnconfiguredAuthService(env.authMode);
    const dataSource = createDataSource(env, () => auth.getAccessToken());
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

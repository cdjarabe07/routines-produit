import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { appRoutes } from '@/app/router';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { DataSourceProvider } from '@/app/providers/DataSourceProvider';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { ToastProvider } from '@/components/ui/Toast';
import { buildDemoData } from '@/data/demo/seed';
import { createDemoAuthService } from '@/services/auth/authService';
import { createMemoryStore, createStoreDataSource } from '@/services/data/storeDataSource';

/** Rend l'application complète (vraies routes, vrais écrans) sur une source de données en mémoire. */
export function renderApp(path: string, options: { userId?: string } = {}) {
  const ds = createStoreDataSource(createMemoryStore(), () => buildDemoData(new Date()));
  if (options.userId) {
    window.sessionStorage.setItem('ra:session', JSON.stringify({ userId: options.userId, startedAt: new Date().toISOString(), mode: 'demo' }));
  }
  const auth = createDemoAuthService(window.sessionStorage);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: 0 } } });
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <DataSourceProvider value={ds}>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider service={auth}>
              <RouterProvider router={router} />
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </DataSourceProvider>
    </QueryClientProvider>,
  );
  return { ds, router, user };
}

/** Horloge figée (seul Date est simulé : les minuteurs réels restent actifs). */
export const FIXED_NOW = new Date(2026, 8, 29, 10, 0, 0);

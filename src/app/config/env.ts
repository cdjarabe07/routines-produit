import type { DataMode } from '@/services/data/types';

export type AuthMode = 'demo' | 'oidc';

export interface AppEnv {
  dataMode: DataMode;
  apiBaseUrl: string | null;
  authMode: AuthMode;
  biEmbedUrl: string | null;
  biAllowedOrigin: string | null;
  /** Erreurs de configuration bloquantes, affichées à l'écran au démarrage. */
  configErrors: string[];
}

function readEnv(): AppEnv {
  const e = import.meta.env;
  const errors: string[] = [];

  const dataMode = (e.VITE_DATA_MODE || 'demo') as string;
  if (dataMode !== 'demo' && dataMode !== 'api') errors.push(`VITE_DATA_MODE invalide : « ${dataMode} » (attendu : demo ou api).`);
  const apiBaseUrl = (e.VITE_API_BASE_URL as string | undefined)?.trim() || null;
  if (dataMode === 'api' && !apiBaseUrl) errors.push('VITE_API_BASE_URL est obligatoire quand VITE_DATA_MODE=api.');

  const authMode = (e.VITE_AUTH_MODE || 'demo') as string;
  if (authMode !== 'demo' && authMode !== 'oidc') errors.push(`VITE_AUTH_MODE invalide : « ${authMode} ».`);

  const biEmbedUrl = (e.VITE_BI_EMBED_URL as string | undefined)?.trim() || null;
  const biAllowedOrigin = (e.VITE_BI_ALLOWED_ORIGIN as string | undefined)?.trim() || null;

  return {
    dataMode: dataMode === 'api' ? 'api' : 'demo',
    apiBaseUrl,
    authMode: authMode === 'oidc' ? 'oidc' : 'demo',
    biEmbedUrl,
    biAllowedOrigin,
    configErrors: errors,
  };
}

export const env: AppEnv = readEnv();

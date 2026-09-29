import type { DataMode } from '@/services/data/types';

export type AuthMode = 'demo' | 'oidc' | 'supabase';

export interface AppEnv {
  dataMode: DataMode;
  apiBaseUrl: string | null;
  authMode: AuthMode;
  /** Projet Supabase (modes « supabase ») : URL et clé publique uniquement. */
  supabaseUrl: string | null;
  supabaseKey: string | null;
  /** Domaine ajouté à un identifiant court (« nadia.benali » → « nadia.benali@domaine »). */
  authEmailDomain: string | null;
  biEmbedUrl: string | null;
  biAllowedOrigin: string | null;
  /** Erreurs de configuration bloquantes, affichées à l'écran au démarrage. */
  configErrors: string[];
}

/** Une clé de service (accès total, contourne la RLS) ne doit jamais atteindre le navigateur. */
export function isSecretSupabaseKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const payload = key.split('.')[1];
  if (!payload) return false;
  try {
    return (JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }).role === 'service_role';
  } catch {
    return false;
  }
}

function readEnv(): AppEnv {
  const e = import.meta.env;
  const errors: string[] = [];

  const dataMode = (e.VITE_DATA_MODE || 'demo') as string;
  if (!['demo', 'api', 'supabase'].includes(dataMode))
    errors.push(`VITE_DATA_MODE invalide : « ${dataMode} » (attendu : demo, api ou supabase).`);
  const apiBaseUrl = (e.VITE_API_BASE_URL as string | undefined)?.trim() || null;
  if (dataMode === 'api' && !apiBaseUrl) errors.push('VITE_API_BASE_URL est obligatoire quand VITE_DATA_MODE=api.');

  const authMode = (e.VITE_AUTH_MODE || 'demo') as string;
  if (!['demo', 'oidc', 'supabase'].includes(authMode)) errors.push(`VITE_AUTH_MODE invalide : « ${authMode} ».`);
  // Données serveur protégées par la RLS : elles exigent une vraie session, jamais les comptes simulés
  if ((dataMode === 'supabase') !== (authMode === 'supabase'))
    errors.push('VITE_DATA_MODE=supabase et VITE_AUTH_MODE=supabase doivent être utilisés ensemble.');

  const supabaseUrl = (e.VITE_SUPABASE_URL as string | undefined)?.trim() || null;
  const supabaseKey = (e.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() || null;
  if (dataMode === 'supabase') {
    if (!supabaseUrl || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl))
      errors.push('VITE_SUPABASE_URL est obligatoire (https://<projet>.supabase.co).');
    if (!supabaseKey) errors.push('VITE_SUPABASE_PUBLISHABLE_KEY est obligatoire.');
    else if (isSecretSupabaseKey(supabaseKey))
      errors.push('VITE_SUPABASE_PUBLISHABLE_KEY contient une clé SECRÈTE : retirez-la immédiatement et faites-la révoquer.');
  }
  const authEmailDomain = (e.VITE_AUTH_EMAIL_DOMAIN as string | undefined)?.trim().replace(/^@/, '') || null;

  const biEmbedUrl = (e.VITE_BI_EMBED_URL as string | undefined)?.trim() || null;
  const biAllowedOrigin = (e.VITE_BI_ALLOWED_ORIGIN as string | undefined)?.trim() || null;

  return {
    dataMode: dataMode === 'api' || dataMode === 'supabase' ? dataMode : 'demo',
    apiBaseUrl,
    authMode: authMode === 'oidc' || authMode === 'supabase' ? authMode : 'demo',
    supabaseUrl,
    supabaseKey,
    authEmailDomain,
    biEmbedUrl,
    biAllowedOrigin,
    configErrors: errors,
  };
}

export const env: AppEnv = readEnv();

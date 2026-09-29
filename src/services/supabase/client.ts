import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* Client Supabase du navigateur : clé PUBLIQUE uniquement (les droits viennent de la session et de la RLS).
   La session est conservée dans sessionStorage : fermée avec l'onglet, jamais partagée entre onglets.
   Limite assumée d'une SPA : un script injecté dans la page pourrait la lire (d'où la CSP stricte, docs/SECURITY_ARCHITECTURE.md). */

export function createSupabaseBrowserClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      storage: window.sessionStorage,
      storageKey: 'ra:auth',
      persistSession: true,
      autoRefreshToken: true,
      flowType: 'pkce',
      // Le routeur utilise le fragment d'URL : aucune session n'y est lue
      detectSessionInUrl: false,
    },
    global: { headers: { 'x-client-info': 'routines-app' } },
  });
}

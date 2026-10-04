import { loadEnv } from 'vite';

/* Serveur des tests automatisés : le projet Supabase de TEST, jamais la production.
   Les suites qui écrivent sur le serveur (rechargement du jeu de démonstration, tests de sécurité, e2e)
   lisent .env.staging.local (mode « staging », non versionné) et refusent de démarrer sur la production. */

/** Référence du projet Supabase de production : toute suite de tests qui le vise est bloquée. */
const PRODUCTION_REF = 'ughqetvvwakkmxwymueg';

export function loadStagingEnv(): { url: string; key: string } {
  const env = loadEnv('staging', process.cwd(), '');
  const url = env.VITE_SUPABASE_URL ?? '';
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
  if (url.includes(PRODUCTION_REF)) {
    throw new Error('Tests refusés : .env.staging.local pointe vers la PRODUCTION. Renseignez le projet Supabase de test.');
  }
  return { url, key };
}

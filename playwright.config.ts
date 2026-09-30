import { defineConfig } from '@playwright/test';

/* Tests de bout en bout sur le build de production (vite preview).
   Navigateur : Microsoft Edge installé sur le poste (canal msedge), aucun téléchargement.
   E2E_BACKEND=supabase : build relié au serveur de démonstration Supabase, vrais comptes (e2e/support/auth.ts),
   jeu de données rechargé avant la suite (e2e/global-setup.ts). */
const supabase = process.env.E2E_BACKEND === 'supabase';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: supabase ? 1 : undefined,
  reporter: [['list']],
  globalSetup: supabase ? './e2e/global-setup.ts' : undefined,
  use: {
    baseURL: 'http://localhost:4173',
    channel: process.env.PW_CHANNEL ?? 'msedge',
    locale: 'fr-FR',
    // Fuseau simulé du navigateur de test (facultatif) : la date opérationnelle reste celle de l'atelier quel qu'il soit
    timezoneId: process.env.PW_TIMEZONE || undefined,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: supabase
      ? 'npm run build:supabase && npx vite preview --port 4173 --strictPort'
      : 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    // Jamais de serveur réutilisé en mode Supabase : il pourrait servir un build de démonstration
    reuseExistingServer: !supabase,
    timeout: 180_000,
  },
});

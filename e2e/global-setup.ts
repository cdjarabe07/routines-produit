import { createClient } from '@supabase/supabase-js';
import { createServer, loadEnv } from 'vite';
import { credentials } from './support/auth';

/* E2E_BACKEND=supabase : recharge le jeu de démonstration du serveur avant la suite (données datées d'aujourd'hui,
   saisies des exécutions précédentes effacées). Refusé par le serveur hors environnement de démonstration. */
export default async function globalSetup() {
  const env = loadEnv('supabase', process.cwd(), '');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  let dataset: unknown;
  try {
    const { buildDemoData } = await server.ssrLoadModule('/src/data/demo/seed.ts');
    dataset = buildDemoData(new Date());
  } finally {
    await server.close();
  }
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { identifier, password } = credentials('admin');
  const { error } = await client.auth.signInWithPassword({ email: identifier, password });
  if (error) throw new Error(`Connexion administrateur impossible : ${error.message}`);
  const { error: seedError } = await client.functions.invoke('demo-seed', {
    body: { dataset, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  });
  if (seedError) throw new Error(`Rechargement du jeu de démonstration refusé : ${seedError.message}`);
  await client.auth.signOut();
}

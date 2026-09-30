import { createClient } from '@supabase/supabase-js';
import { createServer, loadEnv } from 'vite';
import { credentials } from './support/auth';

/* E2E_BACKEND=supabase : recharge le jeu de démonstration du serveur avant la suite (données datées d'aujourd'hui,
   saisies des exécutions précédentes effacées). Refusé par le serveur hors environnement de démonstration. */
export default async function globalSetup() {
  const env = loadEnv('supabase', process.cwd(), '');
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { identifier, password } = credentials('admin');
  const { error } = await client.auth.signInWithPassword({ email: identifier, password });
  if (error) throw new Error(`Connexion administrateur impossible : ${error.message}`);
  // Jeu daté selon le fuseau de l'ATELIER (settings.timezone), pas celui du poste qui lance les tests
  const { data: settings } = await client.from('settings').select('timezone').single();
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  let dataset: unknown;
  try {
    const { setPlantTimeZone } = await server.ssrLoadModule('/src/utils/date.ts');
    setPlantTimeZone(settings?.timezone ?? null);
    const { buildDemoData } = await server.ssrLoadModule('/src/data/demo/seed.ts');
    dataset = buildDemoData(new Date());
  } finally {
    await server.close();
  }
  const { error: seedError } = await client.functions.invoke('demo-seed', { body: { dataset } });
  if (seedError) throw new Error(`Rechargement du jeu de démonstration refusé : ${seedError.message}`);
  await client.auth.signOut();
}

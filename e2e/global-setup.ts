import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';
import { loadStagingEnv } from '../tests/stagingEnv';
import { credentials } from './support/auth';

/* E2E_BACKEND=supabase : recharge le jeu de démonstration du serveur de TEST avant la suite (données datées d'aujourd'hui,
   saisies des exécutions précédentes effacées). Refusé par le serveur hors environnement de démonstration. */
export default async function globalSetup() {
  const { url, key } = loadStagingEnv();
  const client = createClient(url, key, { auth: { persistSession: false } });
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

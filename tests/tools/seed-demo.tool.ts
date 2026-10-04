import fs from 'node:fs';
import { expect, it } from 'vitest';
import { loadStagingEnv } from '../stagingEnv';

/* Premier chargement de la démo sur le serveur de test (entreprise « demo »), avec le jeton d'amorçage.
   npm run db:seed-demo  —  variables : BOOTSTRAP_TOKEN_FILE (jeton, dernière ligne du fichier),
   SECURITY_ACCOUNTS_FILE (fichier JSON où écrire les mots de passe des comptes de démonstration).
   Les mots de passe ne sont jamais affichés. */

it('charge la démonstration sur le serveur', async () => {
  const { url, key } = loadStagingEnv();
  const tokenFile = process.env.BOOTSTRAP_TOKEN_FILE ?? '';
  const out = process.env.SECURITY_ACCOUNTS_FILE ?? '';
  expect(url && key, '.env.staging.local incomplet').toBeTruthy();
  expect(fs.existsSync(tokenFile), 'BOOTSTRAP_TOKEN_FILE introuvable').toBe(true);
  expect(out, 'SECURITY_ACCOUNTS_FILE manquant').toBeTruthy();
  // Import résolu par Vitest à l'exécution : le code de l'application n'est pas typé avec la configuration Node
  const seedModule = '../../src/data/demo/seed';
  const { buildDemoData } = (await import(/* @vite-ignore */ seedModule)) as { buildDemoData: (now: Date) => unknown };
  const token = fs.readFileSync(tokenFile, 'utf8').trim().split(/\r?\n/).pop()!;
  const res = await fetch(`${url}/functions/v1/demo-seed`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json', 'x-bootstrap-token': token },
    body: JSON.stringify({ dataset: buildDemoData(new Date()), timezone: 'Europe/Paris' }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; passwords?: Record<string, string>; createdAccounts?: number };
  expect(res.status, body.error).toBe(200);
  const previous = fs.existsSync(out) ? (JSON.parse(fs.readFileSync(out, 'utf8')) as Record<string, string>) : {};
  fs.writeFileSync(out, JSON.stringify({ ...previous, ...(body.passwords ?? {}) }, null, 2));
  console.log(`Démonstration chargée : ${body.createdAccounts ?? 0} compte(s) créé(s), mots de passe écrits dans ${out}`);
});

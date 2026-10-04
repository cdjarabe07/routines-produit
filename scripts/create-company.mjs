// Création d'une entreprise cliente et de son premier administrateur (opérateur de la plateforme).
//
//   node scripts/create-company.mjs --nom "Plastiques Dupuis" --secteur plastics \
//        --admin-nom "Jeanne Martin" --admin-email jeanne.martin@plastiques-dupuis.fr
//
// Secteurs : generic, automotive, plastics, machining, food, electronics.
// Configuration (hors Git) :
//   - URL du projet : VITE_SUPABASE_URL dans .env.staging.local (ou variable d'environnement SUPABASE_URL) ;
//   - jeton plateforme : fichier désigné par PLATFORM_TOKEN_FILE (une ligne).
// Le mot de passe provisoire de l'administrateur n'est jamais affiché : il est écrit dans un fichier, à transmettre
// à l'administrateur par un canal sûr, puis à supprimer.
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((acc, v, i, all) => (v.startsWith('--') ? [...acc, [v.slice(2), all[i + 1]]] : acc), [])
    .filter(([, v]) => v !== undefined),
);
const required = ['nom', 'secteur', 'admin-nom', 'admin-email'];
const missing = required.filter((k) => !args[k]);
if (missing.length) {
  console.error(`Paramètres manquants : ${missing.map((k) => `--${k}`).join(', ')}`);
  process.exit(1);
}

const env = loadEnv('staging', process.cwd(), '');
const url = process.env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const tokenFile = process.env.PLATFORM_TOKEN_FILE;
if (!url) {
  console.error('URL du projet Supabase introuvable (VITE_SUPABASE_URL dans .env.staging.local, ou SUPABASE_URL).');
  process.exit(1);
}
if (!tokenFile || !fs.existsSync(tokenFile)) {
  console.error('Jeton plateforme introuvable : indiquez son fichier dans PLATFORM_TOKEN_FILE.');
  process.exit(1);
}
const token = fs.readFileSync(tokenFile, 'utf8').trim().split(/\r?\n/).pop();

const res = await fetch(`${url}/functions/v1/create-company`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-platform-token': token },
  body: JSON.stringify({
    name: args.nom,
    sector: args.secteur,
    timezone: args.fuseau ?? 'Europe/Paris',
    admin: { name: args['admin-nom'], email: args['admin-email'] },
  }),
});
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Échec (${res.status}) : ${body.error ?? 'réponse inattendue'}`);
  process.exit(1);
}

const slug = args.nom
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
const out = path.join(path.dirname(tokenFile), `entreprise-${slug}.txt`);
fs.writeFileSync(
  out,
  [
    `Entreprise : ${args.nom} (${body.companyId})`,
    `Administrateur : ${body.adminEmail}`,
    `Mot de passe provisoire : ${body.temporaryPassword}`,
    '',
    'À transmettre par un canal sûr. Supprimez ce fichier une fois transmis.',
  ].join('\n'),
);
console.log(`Entreprise créée (${body.companyId}). Identifiants de l’administrateur écrits dans : ${out}`);

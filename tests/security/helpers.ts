import fs from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadStagingEnv } from '../stagingEnv';

/* Tests de sécurité exécutés CONTRE LE SERVEUR DE TEST (jamais la production : voir tests/stagingEnv.ts).
   Aucun contournement : chaque test utilise la clé publique et la session réelle d'un compte, comme un navigateur hostile.
   Configuration (hors Git) :
     .env.staging.local         VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY du projet de test
     SECURITY_ACCOUNTS_FILE     chemin d'un JSON { "email": "mot de passe" } des comptes de démonstration */

const staging = loadStagingEnv();
export const URL = staging.url;
export const KEY = staging.key;
const accountsFile = process.env.SECURITY_ACCOUNTS_FILE;
const passwords: Record<string, string> =
  accountsFile && fs.existsSync(accountsFile) ? JSON.parse(fs.readFileSync(accountsFile, 'utf8')) : {};

export const configured = Boolean(URL && KEY && Object.keys(passwords).length);

/** Comptes de référence du jeu de démonstration */
export const ACCOUNTS = {
  admin: { email: 'claire.fontaine@atelier.local', id: 'u-admin' },
  manager: { email: 'xavier.dupont@atelier.local', id: 'u-dupont' },
  lineLeaderA: { email: 'karim.benali@atelier.local', id: 'u-karim' },
  hanchoA: { email: 'yann.duclos@atelier.local', id: 'u-yann' },
  quality: { email: 'tom.berg@atelier.local', id: 'u-tom' },
  operatorA: { email: 'nadia.roussel@atelier.local', id: 'u-nadia' },
  operatorB: { email: 'ibrahim.keita@atelier.local', id: 'u-ibrahim' },
  spare: { email: 'aicha.camara@atelier.local', id: 'u-aicha' },
} as const;
export type AccountName = keyof typeof ACCOUNTS;

export function anonClient(): SupabaseClient {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

const sessions = new Map<AccountName, Promise<SupabaseClient>>();

/** Client connecté avec le vrai mot de passe du compte (session mise en cache pour la suite). */
export function as(name: AccountName): Promise<SupabaseClient> {
  if (!sessions.has(name)) {
    sessions.set(
      name,
      (async () => {
        const client = anonClient();
        const { email } = ACCOUNTS[name];
        const { error } = await client.auth.signInWithPassword({ email, password: passwords[email] ?? '' });
        if (error) throw new Error(`Connexion impossible pour ${name} : ${error.message}`);
        return client;
      })(),
    );
  }
  return sessions.get(name)!;
}

export function passwordOf(name: AccountName): string {
  return passwords[ACCOUNTS[name].email] ?? '';
}

/** Appel d'une fonction Edge avec un jeton donné (ou sans), et une origine optionnelle. */
export async function callFunction(
  fn: string,
  body: unknown,
  options: { token?: string; origin?: string; headers?: Record<string, string> } = {},
) {
  const res = await fetch(`${URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.origin ? { Origin: options.origin } : {}),
      ...options.headers,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
}

export async function tokenOf(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  return data.session!.access_token;
}

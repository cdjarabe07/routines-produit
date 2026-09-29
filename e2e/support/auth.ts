import fs from 'node:fs';
import { expect, type Page } from '@playwright/test';

/* Identifiants des tests de bout en bout.
   - demo (défaut) : comptes simulés du navigateur ;
   - supabase (E2E_BACKEND=supabase) : vrais comptes du serveur de démonstration, mots de passe lus dans
     E2E_ACCOUNTS_FILE (JSON { email: mot de passe }, hors Git). */

export const BACKEND = process.env.E2E_BACKEND === 'supabase' ? 'supabase' : 'demo';

const EMAILS: Record<string, string> = {
  'u-admin': 'claire.fontaine@atelier.local',
  'u-dupont': 'xavier.dupont@atelier.local',
  'u-karim': 'karim.benali@atelier.local',
  'u-nadia': 'nadia.roussel@atelier.local',
};
const ALIASES: Record<string, string> = { admin: 'u-admin', manager: 'u-dupont', operateur: 'u-nadia' };

let passwords: Record<string, string> | null = null;
function supabasePassword(email: string): string {
  if (!passwords) {
    const file = process.env.E2E_ACCOUNTS_FILE;
    if (!file || !fs.existsSync(file)) throw new Error('E2E_ACCOUNTS_FILE est requis avec E2E_BACKEND=supabase.');
    passwords = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
  }
  return passwords[email] ?? '';
}

/** Identifiant et mot de passe pour un alias (admin, manager, operateur) ou un identifiant d'utilisateur (u-…). */
export function credentials(who: string): { identifier: string; password: string } {
  if (BACKEND === 'demo') return { identifier: who.startsWith('u-') ? EMAILS[who] : who, password: 'Routines2026' };
  const email = EMAILS[ALIASES[who] ?? who];
  return { identifier: email, password: supabasePassword(email) };
}

export async function loginWithForm(page: Page, who: string) {
  const { identifier, password } = credentials(who);
  await page.goto('/#/login');
  await page.getByLabel(/Identifiant ou email/).fill(identifier);
  await page.getByLabel(/^Mot de passe/).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

/** Ouvre une session pour un utilisateur : injection directe en démo (rapide), vraie connexion avec Supabase. */
export async function signIn(page: Page, userId: string) {
  if (BACKEND === 'demo') {
    await page.goto('/#/login');
    await page.evaluate((id) => {
      localStorage.clear();
      sessionStorage.setItem('ra:session', JSON.stringify({ userId: id, startedAt: new Date().toISOString(), mode: 'demo' }));
    }, userId);
    return;
  }
  await page.goto('/#/login');
  await page.evaluate(() => sessionStorage.clear());
  await loginWithForm(page, userId);
  await expect(page).not.toHaveURL(/#\/login/, { timeout: 20_000 });
}

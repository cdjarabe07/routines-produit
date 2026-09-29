import { expect, test } from '@playwright/test';
import { BACKEND, loginWithForm } from './support/auth';

/* Contrôles de sécurité visibles depuis le navigateur, avec le serveur Supabase (E2E_BACKEND=supabase).
   Les contrôles d'API (RLS, IDOR, audit…) sont dans tests/security (npm run test:security). */

test.describe('sécurité — serveur Supabase', () => {
  test.skip(BACKEND !== 'supabase', 'Mode démo : aucune sécurité réelle, par construction (docs/SECURITY_AUDIT.md)');

  test('une session forgée dans le navigateur n’ouvre aucun accès', async ({ page }) => {
    await page.goto('/#/login');
    await page.evaluate(() => {
      sessionStorage.clear();
      // Attaque de l'audit (P0-1) : fonctionnait avec les comptes simulés
      sessionStorage.setItem('ra:session', JSON.stringify({ userId: 'u-admin', startedAt: new Date().toISOString(), mode: 'demo' }));
    });
    await page.goto('/#/admin/utilisateurs');
    await expect(page).toHaveURL(/#\/login/);
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  });

  test('le mot de passe des comptes simulés est refusé', async ({ page }) => {
    await page.goto('/#/login');
    await page.getByLabel(/Identifiant ou email/).fill('claire.fontaine@atelier.local');
    await page.getByLabel(/^Mot de passe/).fill('Routines2026');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('alert')).toContainText('incorrect');
  });

  test('la session n’est pas conservée dans le stockage persistant', async ({ page }) => {
    await loginWithForm(page, 'operateur');
    await expect(page).toHaveURL(/#\/app$/);
    const persistent = await page.evaluate(() => Object.keys(localStorage).filter((k) => /auth|token|session/i.test(k)));
    expect(persistent).toEqual([]);
  });

  test('un opérateur qui force l’URL d’administration n’obtient aucune donnée', async ({ page }) => {
    await loginWithForm(page, 'operateur');
    await expect(page).toHaveURL(/#\/app$/);
    const userRequests: number[] = [];
    page.on('response', (r) => r.url().includes('/rest/v1/users') && userRequests.push(r.status()));
    await page.goto('/#/admin/utilisateurs');
    await expect(page.getByText('Accès non autorisé')).toBeVisible();
    // L'écran est refusé par l'interface ; et même une requête directe ne renverrait que l'annuaire des comptes actifs (RLS)
    await expect(page.getByRole('cell', { name: 'Désactivé' })).toHaveCount(0);
    expect(userRequests.every((s) => s < 500)).toBe(true);
  });

  test('changement de compte sans rafraîchissement', async ({ page }) => {
    await loginWithForm(page, 'admin');
    await expect(page).toHaveURL(/#\/admin\/dashboard$/);
    await page.getByRole('button', { name: /^Compte :/ }).click();
    await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
    await loginWithForm(page, 'operateur');
    await expect(page).toHaveURL(/#\/app$/);
    await expect(page.getByRole('heading', { level: 1, name: /Bonjour Nadia/ })).toBeVisible();
  });
});

import { expect, test } from '@playwright/test';
import { BACKEND } from './support/auth';

/* Parcours d'un visiteur : vitrine → démo → choix d'un profil, sans compte. */

test.skip(BACKEND === 'supabase', 'La démo publique fonctionne sans serveur');

test('la vitrine mène à la démo, où l’on entre en un clic avec un rôle', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Les routines terrain');
  await expect(page).toHaveTitle(/Routine/);
  await page.getByRole('link', { name: 'Essayer la démo' }).first().click();
  await expect(page.getByRole('heading', { name: 'Découvrir la démo' })).toBeVisible();
  await page.getByRole('button', { name: /Manager/ }).click();
  // « Bonjour » ou « Bonsoir » selon l’heure de l’atelier
  await expect(page.getByRole('heading', { level: 1, name: /(Bonjour|Bonsoir) Xavier/ })).toBeVisible({ timeout: 15_000 });
});

test('la vitrine ne déborde pas sur téléphone et reste lisible sans le bouton de contact non configuré', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('link', { name: 'Demander une présentation' })).toHaveCount(0);
});

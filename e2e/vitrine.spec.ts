import { expect, test } from '@playwright/test';
import { BACKEND } from './support/auth';

/* Parcours d'un visiteur : vitrine → démo → choix d'un profil, sans compte. */

test.skip(BACKEND === 'supabase', 'La démo publique fonctionne sans serveur');

test('la vitrine mène à la démo, où l’on entre en un clic avec un rôle', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Les routines terrain');
  await expect(page).toHaveTitle(/Routine/);
  await page.getByRole('link', { name: 'Essayer la démo' }).first().click();
  // Premier chargement de l’application : tout son code est téléchargé
  await expect(page.getByRole('heading', { name: 'Découvrir la démo' })).toBeVisible({ timeout: 15_000 });
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

test('démo au choix du secteur : l’agroalimentaire, avec ses postes et ses routines', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Agroalimentaire/ }).click();
  await expect(page.getByRole('heading', { name: 'Découvrir la démo' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Opérateur/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: /(Bonjour|Bonsoir) Nadia/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Atelier de plats cuisinés').first()).toBeVisible();
  await page.goto('/app/#/app/routines?vue=upcoming');
  await expect(page.getByText('Hygiène avant démarrage').first()).toBeVisible();
  // Retour à l'atelier d'origine par la vitrine
  await page.goto('/app/?secteur=automotive#/app');
  await expect(page.getByText('Atelier de câblage').first()).toBeVisible({ timeout: 15_000 });
});

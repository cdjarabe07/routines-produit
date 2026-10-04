import { expect, test } from '@playwright/test';
import { BACKEND } from './support/auth';

/* Parcours d'un visiteur : vitrine → démo → choix d'un profil, sans compte. */

test.skip(BACKEND === 'supabase', 'La démo publique fonctionne sans serveur');

test('la vitrine mène à la démo, où l’on entre en un clic avec un rôle', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Les contrôles de votre atelier');
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

test('démo au choix du secteur : l’agroalimentaire, avec ses postes et ses routines, puis retour à la présentation', async ({ page }) => {
  await page.goto('/');
  const sectors = page.locator('#secteurs');
  await sectors.getByRole('tab', { name: 'Agroalimentaire' }).click();
  await expect(sectors.getByText('Arrêté du 21/12/2009')).toBeVisible();
  // La capture et l'exemple de contrôle de l'ouverture suivent le secteur choisi
  await expect(page.getByText('Chambre froide des produits finis : 1,8 °C')).toBeVisible();
  await sectors.getByRole('link', { name: 'Ouvrir la démo de ce secteur' }).click();
  await expect(page.getByRole('heading', { name: 'Découvrir la démo' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Opérateur/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: /(Bonjour|Bonsoir) Nadia/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Atelier de plats cuisinés').first()).toBeVisible();
  await page.goto('/app/#/app/routines?vue=upcoming');
  await expect(page.getByText('Hygiène avant démarrage').first()).toBeVisible();
  // Depuis la démo, retour à la présentation
  await page.getByRole('link', { name: '← Retour à la présentation' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Les contrôles de votre atelier');
  // Le secteur choisi est repris sur la présentation
  await expect(page.locator('#secteurs').getByRole('tab', { name: 'Agroalimentaire' })).toHaveAttribute('aria-selected', 'true');
});

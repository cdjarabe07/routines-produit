import { expect, test, type Page } from '@playwright/test';
import { BACKEND, signIn } from './support/auth';

/* Vérifications dans un vrai navigateur :
   1. chaque route s'affiche sans erreur JavaScript pour chaque rôle ;
   2. aucune page ne déborde horizontalement (mobile, tablette, bureau, grand écran) ;
   3. parcours Andon complet. */

const ROUTES = [
  '/app',
  '/app/planning',
  '/app/planning?vue=semaine',
  '/app/routines',
  '/app/routines?vue=late',
  '/app/routines/sc-ll-audit/TODAY',
  '/app/routines/sc-op-start-a/TODAY',
  '/app/reunions',
  '/app/actions',
  '/app/sequences',
  '/app/passation',
  '/app/connaissances',
  '/andon',
  '/andon?vue=historique',
  '/andon/ad-live-1',
  '/actions/ac-task-2',
  '/anomalies/an-today-1',
  '/reunions/mt-today',
  '/reunions/ev-training',
  '/connaissances/kb-std-02',
  '/gemba/gw-1',
  '/signaler?poste=P4',
  '/manager',
  '/manager/equipe',
  '/manager/routines',
  '/manager/production',
  '/manager/production?vue=stocks',
  '/manager/atelier',
  '/manager/anomalies',
  '/manager/actions',
  '/manager/gemba',
  '/manager/gemba/nouvelle',
  '/manager/qualite',
  '/manager/reporting',
  '/manager/bi',
  '/admin/dashboard',
  '/admin/planification',
  '/admin/planification?vue=semaine',
  '/admin/reunions',
  '/admin/agenda',
  '/admin/routines',
  '/admin/checklists',
  '/admin/sequences',
  '/admin/connaissances',
  '/admin/utilisateurs',
  '/admin/equipes',
  '/admin/postes',
  '/admin/roles',
  '/admin/parametres',
  '/admin/journal',
  '/admin/integration',
];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function visit(page: Page, route: string) {
  await page.goto(`/#${route.replace('TODAY', today())}`);
  await page.reload();
  await expect(page.locator('main#contenu')).toBeVisible();
  await expect(page.getByRole('status', { name: /Chargement/ })).toHaveCount(0, { timeout: 10_000 });
}

for (const role of [
  { id: 'u-admin', name: 'administrateur' },
  { id: 'u-dupont', name: 'manager' },
  { id: 'u-karim', name: 'line leader' },
  { id: 'u-nadia', name: 'opérateur' },
]) {
  test(`toutes les routes s'affichent sans erreur — ${role.name}`, async ({ page }) => {
    // 51 routes, chacune rechargée : bien au-delà du délai par défaut
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await signIn(page, role.id);
    for (const route of ROUTES) {
      await visit(page, route);
      await expect(page.getByText('Cet écran n’a pas pu s’afficher')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablette', width: 768, height: 1024 },
  { name: 'bureau', width: 1280, height: 800 },
  { name: 'grand écran', width: 1920, height: 1080 },
]) {
  test(`aucun débordement horizontal — ${viewport.name}`, async ({ page }) => {
    test.skip(BACKEND === 'supabase', 'Mise en page indépendante du serveur : vérifiée en mode démo');
    test.setTimeout(240_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await signIn(page, 'u-admin');
    const overflowing: string[] = [];
    for (const route of ROUTES) {
      await visit(page, route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) overflowing.push(`${route} (+${overflow}px)`);
    }
    expect(overflowing).toEqual([]);
  });
}

test('parcours Andon : déclencher, prendre en charge, résoudre', async ({ page }) => {
  await signIn(page, 'u-karim');
  await visit(page, '/andon');
  await page.getByRole('button', { name: 'Déclencher un Andon' }).click();
  const dialog = page.getByRole('dialog', { name: 'Déclencher un Andon' });
  await dialog.getByRole('button', { name: /^P3/ }).click();
  await dialog.getByRole('button', { name: 'Matière' }).click();
  await dialog.getByRole('button', { name: 'Ruban épuisé' }).click();
  await dialog.getByRole('button', { name: 'Déclencher' }).click();
  await expect(dialog).toBeHidden();

  const tile = page.getByRole('listitem').filter({ hasText: 'Ruban épuisé' });
  await expect(tile).toContainText('Nouveau');
  await tile.getByRole('button', { name: 'Je prends en charge' }).click();
  await expect(tile).toContainText('Karim Benali intervient');
  await tile.getByRole('button', { name: 'Résoudre' }).click();

  const resolve = page.getByRole('dialog', { name: /Résoudre l’Andon/ });
  await resolve.getByLabel(/Cause identifiée/).fill('Réappro non déclenché');
  await resolve.getByLabel(/Action réalisée/).fill('Rouleau livré, seuil kanban corrigé');
  await resolve.getByRole('button', { name: 'Marquer résolu' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Ruban épuisé' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Historique et analyse' }).click();
  await expect(page.getByRole('cell', { name: 'Réappro non déclenché' })).toBeVisible();
});

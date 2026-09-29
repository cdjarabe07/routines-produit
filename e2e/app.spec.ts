import { expect, test, type Page } from '@playwright/test';

/* Vérifications dans un vrai navigateur :
   1. chaque route s'affiche sans erreur JavaScript pour chaque rôle ;
   2. aucune page ne déborde horizontalement (mobile, tablette, bureau, grand écran) ;
   3. parcours Andon complet. */

const ROUTES = [
  '/', '/routines', '/routines/modeles', '/routines/rt-ll-audit/TODAY', '/actions', '/actions/ac-task-2', '/agenda', '/reunions/mt-today',
  '/passation', '/equipe', '/andon', '/andon?vue=historique', '/production', '/production?vue=stocks', '/atelier', '/sequences',
  '/anomalies', '/anomalies/an-today-1', '/signaler?poste=P4', '/gemba', '/gemba/nouvelle', '/gemba/gw-1', '/qualite', '/reporting',
  '/bi', '/connaissances', '/connaissances/kb-std-02', '/admin/utilisateurs', '/admin/roles', '/admin/postes', '/admin/parametres',
];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function signIn(page: Page, userId: string) {
  await page.goto('/#/connexion');
  await page.evaluate((id) => {
    localStorage.clear();
    sessionStorage.setItem('ra:session', JSON.stringify({ userId: id, startedAt: new Date().toISOString(), mode: 'demo' }));
  }, userId);
}

async function visit(page: Page, route: string) {
  await page.goto(`/#${route.replace('TODAY', today())}`);
  await page.reload();
  await expect(page.locator('main#contenu')).toBeVisible();
  await expect(page.getByRole('status', { name: /Chargement/ })).toHaveCount(0, { timeout: 10_000 });
}

for (const role of [
  { id: 'u-admin', name: 'administrateur' },
  { id: 'u-karim', name: 'line leader' },
  { id: 'u-nadia', name: 'opérateur' },
]) {
  test(`toutes les routes s'affichent sans erreur — ${role.name}`, async ({ page }) => {
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
  await expect(tile).toContainText('En attente');
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

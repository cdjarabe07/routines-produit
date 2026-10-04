import { expect, test, type Page } from '@playwright/test';
import { BACKEND, loginWithForm, signIn } from './support/auth';

/* Scénarios de la demande (§46), dans un vrai navigateur et une seule session :
   les données saisies par l'administrateur sont retrouvées par l'opératrice, puis par le manager.
   1. Administrateur : routine + tâches → planification pour Nadia → réunion avec Nadia → vérification.
   2. Opératrice : tableau de bord → routine et réunion → démarrer → tâches → commentaire → terminer.
   3. Anomalie : Andon → prise en charge par le manager → action corrective → résolution → clôture → reporting. */

const ROUTINE = 'Contrôle sécurité poste 4';
const MEETING = 'Point qualité poste 4';

async function login(page: Page, who: string) {
  await loginWithForm(page, who);
}

async function logout(page: Page) {
  await page.getByRole('button', { name: /^Compte :/ }).click();
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
}

test('administration → planification → exécution → Andon → action corrective → reporting', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/app/#/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  /* ---------- Scénario 1 : administrateur ---------- */
  await login(page, 'admin');
  await expect(page).toHaveURL(/#\/admin\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Administration' })).toBeVisible();

  // Routine et tâches
  await page.goto('/app/#/admin/routines');
  await page.getByRole('button', { name: 'Nouvelle routine' }).click();
  const editor = page.getByRole('dialog', { name: 'Nouvelle routine' });
  await editor.getByRole('textbox', { name: 'Titre', exact: true }).fill(ROUTINE);
  await editor.getByLabel(/Durée prévue/).fill('10');
  await editor.getByLabel('Titre de la tâche').fill('Vérifier le carter de protection');
  await editor.getByRole('button', { name: 'Ajouter une tâche' }).click();
  await editor.getByLabel('Titre de la tâche').fill('Vérifier l’arrêt d’urgence');
  await editor.getByRole('button', { name: 'Enregistrer la routine' }).click();
  await expect(editor).toBeHidden();
  const row = page.getByRole('row').filter({ hasText: ROUTINE });
  await expect(row).toContainText('Non planifiée');

  // Planification pour Nadia
  await row.getByRole('link', { name: 'Planifier' }).click();
  const planner = page.getByRole('dialog', { name: 'Programmer une routine' });
  await planner.getByLabel('Répétition').selectOption('once');
  await planner.getByLabel('Personne').selectOption({ label: 'Nadia Roussel' });
  await planner.getByRole('button', { name: 'Programmer' }).click();
  await expect(planner).toBeHidden();
  await expect(page.getByRole('row').filter({ hasText: ROUTINE })).toContainText('Nadia Roussel');

  // Réunion avec Nadia
  await page.goto('/app/#/admin/reunions');
  await page.getByRole('button', { name: 'Nouvelle réunion' }).click();
  const meetingForm = page.getByRole('dialog', { name: 'Nouvelle réunion' });
  await meetingForm.getByRole('textbox', { name: 'Titre', exact: true }).fill(MEETING);
  await meetingForm.getByLabel('Heure de début').fill('23:00');
  await meetingForm.getByLabel('Heure de fin').fill('23:30');
  await meetingForm.getByRole('checkbox', { name: 'Nadia Roussel' }).check();
  await meetingForm.getByRole('button', { name: 'Planifier' }).click();
  await expect(meetingForm).toBeHidden();
  await expect(page.getByRole('row').filter({ hasText: MEETING })).toBeVisible();

  // Vérification du planning (semaine)
  await page.goto('/app/#/admin/planification?vue=semaine');
  await expect(page.getByRole('link', { name: ROUTINE })).toBeVisible();
  await logout(page);

  /* ---------- Scénario 2 : opératrice ---------- */
  await login(page, 'operateur');
  await expect(page).toHaveURL(/#\/app$/);
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour Nadia/ })).toBeVisible();
  await expect(page.getByRole('link', { name: ROUTINE }).first()).toBeVisible();
  await page.goto('/app/#/app/reunions');
  await expect(page.getByRole('link', { name: MEETING })).toBeVisible();

  await page.goto('/app/#/app');
  await page
    .getByRole('button', { name: `Démarrer ${ROUTINE}` })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1, name: ROUTINE })).toBeVisible();
  await page
    .getByRole('group', { name: 'Résultat : Vérifier le carter de protection' })
    .getByRole('button', { name: 'Conforme', exact: true })
    .click();
  await page
    .getByRole('group', { name: 'Résultat : Vérifier l’arrêt d’urgence' })
    .getByRole('button', { name: 'Conforme', exact: true })
    .click();
  await page.getByLabel('Ajouter un commentaire').fill('Carter resserré avant contrôle.');
  await page.getByRole('button', { name: 'Publier' }).click();
  await expect(page.getByText('Carter resserré avant contrôle.')).toBeVisible();
  await page.getByRole('button', { name: 'Terminer la routine' }).click();
  const recap = page.getByRole('dialog', { name: 'Routine terminée' });
  await expect(recap).toContainText('2/2');
  await recap.getByRole('button', { name: 'Terminer' }).click();
  await expect(page).toHaveURL(/#\/app$/);
  await expect(
    page
      .getByRole('region', { name: 'Fait aujourd’hui' })
      .or(page.locator('section', { hasText: 'Fait aujourd’hui' }))
      .first(),
  ).toContainText(ROUTINE);

  /* ---------- Scénario 3 : anomalie ---------- */
  await page.goto('/app/#/andon?declencher=1');
  const raise = page.getByRole('dialog', { name: 'Déclencher un Andon' });
  await raise.getByRole('button', { name: /^P4/ }).click();
  await raise.getByRole('button', { name: 'Équipement' }).click();
  await raise.getByLabel('Description du problème').fill('Carter de protection fissuré');
  await raise.getByRole('radio', { name: /Critique/ }).click();
  await raise.getByRole('button', { name: 'Déclencher' }).click();
  await expect(raise).toBeHidden();
  await page.goto('/app/#/app');
  await expect(page.getByText('Andon actif · Poste 4 — Rubanage')).toBeVisible();
  await logout(page);

  await login(page, 'manager');
  await expect(page).toHaveURL(/#\/manager$/);
  await page.goto('/app/#/andon');
  const tile = page.getByRole('listitem').filter({ hasText: 'Carter de protection fissuré' });
  await tile.getByRole('button', { name: 'Je prends en charge' }).click();
  await expect(tile).toContainText('Xavier Dupont intervient');
  await tile.getByRole('link', { name: 'Détail' }).click();

  await expect(page.getByRole('heading', { level: 1, name: /Andon équipement — Poste 4/ })).toBeVisible();
  await page.getByRole('button', { name: 'Créer une action corrective' }).click();
  const actionForm = page.getByRole('dialog', { name: 'Action corrective' });
  await actionForm.getByLabel(/Responsable/).selectOption({ label: 'Yann Duclos' });
  await actionForm.getByRole('button', { name: 'Créer l’action' }).click();
  await expect(actionForm).toBeHidden();
  await page.getByRole('button', { name: 'Démarrer la résolution' }).click();
  await expect(page.getByText('En résolution').first()).toBeVisible();
  await page.getByRole('button', { name: 'Résoudre' }).click();
  const resolve = page.getByRole('dialog', { name: /Résoudre l’Andon/ });
  await resolve.getByLabel(/Cause identifiée/).fill('Fixation desserrée par les vibrations');
  await resolve.getByLabel(/Action réalisée/).fill('Carter remplacé, fixations freinées');
  await resolve.getByRole('button', { name: 'Marquer résolu' }).click();
  await expect(page.getByRole('heading', { name: 'Résolution' })).toBeVisible();

  // Clôture de l'action corrective
  await page.getByRole('link', { name: /Éviter la récidive/ }).click();
  await page.getByRole('button', { name: 'Marquer terminée' }).click();
  const close = page.getByRole('dialog', { name: 'Terminer l’action' });
  await close.getByLabel(/Résolution/).fill('Contrôle du serrage ajouté à la routine du poste 4');
  await close.getByRole('button', { name: 'Terminer' }).click();
  await expect(page.getByRole('heading', { name: 'Résolution' })).toBeVisible();

  // Reporting : l'Andon, l'action et la routine de Nadia sont comptés
  await page.goto('/app/#/manager/reporting');
  const byRoutine = page.getByRole('row').filter({ hasText: ROUTINE });
  await expect(byRoutine).toContainText('1');
  await expect(page.getByText('Andon déclenchés', { exact: true })).toBeVisible();

  expect(errors).toEqual([]);
});

test('déconnexion depuis la supervision puis connexion opérateur : arrivée directe sur son espace', async ({ page }) => {
  await page.goto('/app/#/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await login(page, 'admin');
  await page.getByRole('button', { name: 'Supervision' }).click();
  await page.getByRole('link', { name: 'Reporting' }).click();
  await expect(page).toHaveURL(/#\/manager\/reporting/);
  await logout(page);
  await expect(page).toHaveURL(/#\/login$/);
  await login(page, 'operateur');
  await expect(page).toHaveURL(/#\/app$/);
  await expect(page.getByRole('heading', { level: 1, name: /Bonjour Nadia/ })).toBeVisible();

  // Un lien protégé reste respecté s'il est autorisé, sinon l'espace d'accueil prend le relais
  await logout(page);
  await page.goto('/app/#/manager/reporting');
  await expect(page).toHaveURL(/retour=/);
  await login(page, 'operateur');
  await expect(page).toHaveURL(/#\/app$/);
});

test('reporting interactif : survol, détail d’un jour, d’une catégorie et d’une routine', async ({ page }) => {
  await page.goto('/app/#/login');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await login(page, 'manager');
  await page.goto('/app/#/manager/reporting');

  // Clavier : flèches puis Entrée
  const chart = page.getByRole('group', { name: /^Anomalies déclarées par jour/ });
  await chart.focus();
  await page.keyboard.press('ArrowRight');
  await expect(chart.getByRole('status')).toContainText('anomalie');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /^Détail du / })).toBeVisible();
  await expect(page).toHaveURL(/jour=/);
  await page.getByRole('button', { name: 'Fermer' }).click();

  // Souris : clic sur un jour du graphique des routines
  const routines = page.getByRole('group', { name: /^Réalisation des routines par jour/ });
  // Souris réelle (coordonnées) : la vérification de « stabilité » de Playwright ne s'applique pas bien aux zones SVG
  await routines.scrollIntoViewIfNeeded();
  const box = (await routines.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(routines.getByRole('status')).toBeVisible();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(page.getByRole('region', { name: 'Routines' }).getByRole('link').first()).toBeVisible();
  await page.getByRole('button', { name: 'Fermer' }).click();

  // Catégorie d'anomalie
  await page.getByRole('button', { name: /^Qualité/ }).click();
  await expect(page.getByRole('heading', { name: /Anomalies « Qualité »/ })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer' }).click();

  // Ligne du tableau par routine
  await page.getByRole('button', { name: 'Audit terrain' }).click();
  await expect(page.getByRole('heading', { name: /^Audit terrain — / })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByRole('heading', { name: /^Audit terrain — / })).toHaveCount(0);
});

test('modules : un module décoché disparaît du menu et de la carte, ses écrans l’indiquent', async ({ page }) => {
  test.skip(BACKEND === 'supabase', 'Modifie les paramètres du site : vérifié en mode démo uniquement');
  await signIn(page, 'u-admin');
  await page.goto('/app/#/admin/parametres');
  await page.reload();
  await page.getByLabel('Gemba Walk').uncheck();
  await page.getByRole('button', { name: 'Enregistrer les modules' }).click();
  await expect(page.getByText('Modules enregistrés.')).toBeVisible();

  await page.goto('/app/#/manager');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav.getByRole('link', { name: 'Anomalies' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Gemba Walk' })).toHaveCount(0);
  await page.goto('/app/#/manager/gemba');
  await expect(page.getByText('Module désactivé')).toBeVisible();
  await page.goto('/app/#/processus');
  await expect(page.getByText('Actions correctives', { exact: true })).toBeVisible();
  await expect(page.getByText('Gemba Walk', { exact: true })).toHaveCount(0);
});

test('sections : les écrans regroupés se parcourent par onglets', async ({ page }) => {
  await signIn(page, 'u-admin');
  await page.goto('/app/#/admin/agenda');
  await page.reload();
  const tabs = page.getByRole('navigation', { name: 'Sections' });
  await tabs.getByRole('link', { name: 'Gestion des réunions' }).click();
  await expect(page).toHaveURL(/#\/admin\/reunions/);
  await expect(
    page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Agenda et réunions' }),
  ).toHaveClass(/active/);
});

test('référentiels : une étape renommée et un rôle rebaptisé apparaissent partout', async ({ page }) => {
  test.skip(BACKEND === 'supabase', 'Modifie les paramètres du site : vérifié en mode démo uniquement');
  await signIn(page, 'u-admin');
  await page.goto('/app/#/admin/referentiels');
  await page.reload();
  await page.getByLabel('Nom (étape 2)').fill('Sertissage automatique');
  await page.getByLabel('Chef d’équipe', { exact: true }).fill('Animateur');
  await page.locator('#poste-night').uncheck();
  await page.getByRole('button', { name: 'Enregistrer les référentiels' }).click();
  await expect(page.getByText('Référentiels enregistrés.')).toBeVisible();
  await page.goto('/app/#/manager/production');
  await expect(page.getByRole('heading', { name: 'Sertissage automatique' })).toBeVisible();
  await page.goto('/app/#/admin/utilisateurs');
  await expect(page.getByRole('table').getByText('Animateur').first()).toBeVisible();
});

test('contrôles enrichis : anomalie automatique, commentaire exigé, saisie de lot', async ({ page }) => {
  test.skip(BACKEND === 'supabase', 'Jeu de démonstration daté au mardi matin : vérifié en mode démo');
  await page.clock.install({ time: new Date('2026-10-06T07:35:00Z') });
  await signIn(page, 'u-nadia');
  await page.goto('/app/#/app/routines');
  await page.reload();
  await page
    .getByRole('link', { name: /Contrôle début de poste/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Démarrer' }).first().click();
  const outil = page.getByRole('group', { name: 'Résultat : Outil conforme à la référence du terminal' });
  await outil.getByRole('button', { name: /^Non conforme$/ }).click();
  await expect(page.getByRole('link', { name: 'Anomalie liée' }).first()).toBeVisible();
  await expect(page.getByText('Commentaire obligatoire (non conforme)')).toBeVisible();
  await page.getByLabel(/Commentaire \(obligatoire\)/).fill('Outil usé, remplacé');
  await page.getByRole('button', { name: 'Enregistrer le commentaire' }).click();
  await expect(page.getByText('Commentaire obligatoire (non conforme)')).toHaveCount(0);
  await page.getByPlaceholder('Saisir ou scanner').fill('LT-48213');
  await page.getByPlaceholder('Saisir ou scanner').press('Enter');
  await expect(page.getByText('LT-48213', { exact: true })).toBeVisible();
});

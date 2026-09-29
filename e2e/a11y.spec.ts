import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/* Audit d'accessibilité automatique (axe-core, règles WCAG 2.1 A et AA) sur chaque écran.
   L'audit automatique ne remplace pas un test avec lecteur d'écran, mais bloque les régressions. */

const ROUTES = [
  '/connexion',
  '/',
  '/routines',
  '/routines/rt-ll-audit/TODAY',
  '/actions',
  '/actions/ac-task-2',
  '/agenda',
  '/reunions/mt-today',
  '/passation',
  '/equipe',
  '/andon',
  '/andon?vue=historique',
  '/production',
  '/production?vue=stocks',
  '/atelier',
  '/sequences',
  '/anomalies',
  '/anomalies/an-today-1',
  '/signaler?poste=P4',
  '/gemba',
  '/gemba/nouvelle',
  '/gemba/gw-1',
  '/qualite',
  '/reporting',
  '/bi',
  '/connaissances',
  '/connaissances/kb-std-02',
  '/admin/utilisateurs',
  '/admin/roles',
  '/admin/postes',
  '/admin/parametres',
];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('aucune violation WCAG A/AA détectée par axe', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/#/connexion');
  await page.evaluate(() => localStorage.clear());
  const report: string[] = [];

  for (const route of ROUTES) {
    await page.evaluate((signedIn) => {
      if (signedIn)
        sessionStorage.setItem('ra:session', JSON.stringify({ userId: 'u-admin', startedAt: new Date().toISOString(), mode: 'demo' }));
      else sessionStorage.removeItem('ra:session');
    }, route !== '/connexion');
    await page.goto(`/#${route.replace('TODAY', today())}`);
    await page.reload();
    await expect(page.getByRole('status', { name: /Chargement/ })).toHaveCount(0, { timeout: 10_000 });
    await page.waitForTimeout(300);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    for (const v of results.violations) {
      report.push(`${route} — [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes[0]?.target.join(' ')}`);
    }
  }
  expect(report, report.join('\n')).toEqual([]);
});

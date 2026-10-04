import AxeBuilder from '@axe-core/playwright';
import { BACKEND } from './support/auth';
import { expect, test } from '@playwright/test';

/* Audit d'accessibilité automatique (axe-core, règles WCAG 2.1 A et AA) sur chaque écran.
   L'audit automatique ne remplace pas un test avec lecteur d'écran, mais bloque les régressions. */

const ROUTES = [
  '/login',
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
  '/processus',
  '/processus?vue=fabrication',
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
  '/admin/agenda?vue=jour',
  '/admin/agenda?vue=mois',
  '/admin/agenda?vue=liste',
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
  '/admin/erreurs',
  '/admin/usage',
  '/admin/integration',
];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('aucune violation WCAG A/AA détectée par axe', async ({ page }) => {
  test.skip(BACKEND === 'supabase', 'Interface indépendante du serveur : vérifiée en mode démo');
  test.setTimeout(600_000);
  await page.goto('/#/login');
  await page.evaluate(() => localStorage.clear());
  const report: string[] = [];

  for (const route of ROUTES) {
    await page.evaluate((signedIn) => {
      if (signedIn)
        sessionStorage.setItem('ra:session', JSON.stringify({ userId: 'u-admin', startedAt: new Date().toISOString(), mode: 'demo' }));
      else sessionStorage.removeItem('ra:session');
    }, route !== '/login');
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

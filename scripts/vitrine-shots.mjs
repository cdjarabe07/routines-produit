/* Captures d'écran de la vitrine, à partir de la démo de chaque secteur (Playwright + Edge installé).
   Usage : npm run build && npx vite preview --port 4173   puis   node scripts/vitrine-shots.mjs [url-de-base]
   La démo est figée un mardi à 10 h 05 (heure de Paris) pour montrer une journée en cours. */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv[2] ?? 'http://localhost:4173';
const out = path.resolve('public/vitrine');
const TIME = new Date('2026-10-06T08:05:00Z');
const DAY = '2026-10-06';
fs.mkdirSync(out, { recursive: true });

const SECTORS = ['automotive', 'plastics', 'machining', 'food', 'electronics', 'generic'];
const shots = [
  ...SECTORS.map((sector) => ({ file: `supervision-${sector}.jpg`, sector, user: 'u-dupont', route: '/manager' })),
  { file: 'routine.jpg', sector: 'food', user: 'u-nadia', route: `/app/routines/sc-sec-2/${DAY}/0800` },
  { file: 'andon.jpg', sector: 'plastics', user: 'u-dupont', route: '/andon' },
  { file: 'actions.jpg', sector: 'machining', user: 'u-dupont', route: '/manager/actions' },
  { file: 'planification.jpg', sector: 'electronics', user: 'u-admin', route: '/admin/planification?vue=semaine' },
  { file: 'modele.jpg', sector: 'generic', user: 'u-admin', route: '/admin/modele-secteur', click: { role: 'radio', name: /Plasturgie/ } },
  { file: 'operateur.jpg', sector: 'food', user: 'u-nadia', route: '/app', mobile: true },
];

const browser = await chromium.launch({ channel: 'msedge' });
const problems = [];
for (const s of shots) {
  const viewport = s.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const context = await browser.newContext({ viewport, deviceScaleFactor: s.mobile ? 2 : 1, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`${s.file} : ${e.message}`));
  await page.clock.install({ time: TIME });
  await context.addInitScript(
    ([userId, startedAt]) => sessionStorage.setItem('ra:session', JSON.stringify({ userId, startedAt, mode: 'demo' })),
    [s.user, TIME.toISOString()],
  );
  await page.goto(`${base}/app/?secteur=${s.sector}#${s.route}`);
  // Écran prêt : titre principal affiché et plus aucun indicateur de chargement
  await page.locator('main h1').first().waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  if (s.click) {
    await page.getByRole(s.click.role, { name: s.click.name }).click();
    await page.waitForTimeout(400);
  }
  // Notifications éphémères masquées pour une capture nette
  await page.addStyleTag({ content: '[role="status"],[data-toast]{display:none!important}' });
  await page.screenshot({ path: path.join(out, s.file), type: 'jpeg', quality: 82 });
  await context.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : `${shots.length} captures écrites dans ${out}`);

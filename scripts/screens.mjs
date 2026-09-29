/* Captures d'écran pour l'audit visuel (Playwright + Edge installé).
   Usage : node scripts/screens.mjs <url-de-base> <dossier-sortie> [profil] [routes...]
   Exemple : node scripts/screens.mjs http://localhost:5173 ./shots u-karim / /andon */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [base = 'http://localhost:5173', outDir = './shots', profile = 'u-karim', ...routes] = process.argv.slice(2);
const viewports = (process.env.VIEWPORTS ?? 'desktop:1440x900,mobile:390x844').split(',').map((v) => {
  const [name, size] = v.split(':');
  const [width, height] = size.split('x').map(Number);
  return { name, width, height };
});
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' });
const problems = [];
for (const vp of viewports) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'fr-FR' });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`[${vp.name}] pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`[${vp.name}] console: ${m.text()}`));
  await page.goto(`${base}/#/connexion`);
  await page.evaluate(
    (userId) => sessionStorage.setItem('ra:session', JSON.stringify({ userId, startedAt: new Date().toISOString(), mode: 'demo' })),
    profile,
  );
  for (const route of routes.length ? routes : ['/']) {
    await page.goto(`${base}/#${route}`);
    await page.reload(); // le changement de hash seul ne relit pas la session
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) problems.push(`[${vp.name}] ${route}: débordement horizontal de ${overflow}px`);
    const file = path.join(outDir, `${vp.name}${route.replace(/[/?=&]/g, '_') || '_home'}.png`);
    await page.screenshot({ path: file, fullPage: process.env.FULL === '1' });
  }
  await context.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'Aucun problème détecté');

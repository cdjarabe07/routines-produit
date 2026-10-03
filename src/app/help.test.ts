/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { GLOSSARY, hasSpecificHelp, helpFor } from './help';

/* Chaque écran du routeur doit avoir sa rubrique d'aide : la liste des routes est lue dans router.tsx,
   un nouvel écran sans aide fait échouer ce test (l'aide ne peut plus se périmer en silence). */

const routerSource = Object.values(import.meta.glob('./router.tsx', { query: '?raw', import: 'default', eager: true }))[0] as string;

function screenPaths(): string[] {
  const [spacesPart, commonPart] = routerSource.split('Écrans de détail communs');
  const paths: string[] = [];
  let prefix = '';
  for (const m of spacesPart!.matchAll(/space\('([a-z]+)'|path: '([^']+)'/g)) {
    if (m[1]) {
      prefix = `/${m[1]}`;
      paths.push(prefix);
    } else if (prefix) paths.push(`${prefix}/${m[2]}`);
  }
  for (const m of commonPart!.matchAll(/path: '([^']+)'/g)) if (m[1] !== '*') paths.push(`/${m[1]}`);
  // Paramètres d'URL remplacés par une valeur d'exemple
  return paths.map((p) => p.replace(/:[a-zA-Z]+/g, 'exemple'));
}

describe('Aide contextuelle', () => {
  const paths = screenPaths();

  it('la liste des écrans est bien lue dans le routeur', () => {
    expect(paths.length).toBeGreaterThan(40);
    expect(paths).toContain('/app/routines/exemple/exemple');
    expect(paths).toContain('/andon/exemple');
  });

  it.each(paths.filter((p) => p !== '/admin'))('%s a sa propre rubrique', (path) => {
    expect(hasSpecificHelp(path)).toBe(true);
    const topic = helpFor(path);
    expect(topic.purpose.length).toBeGreaterThan(10);
    expect(topic.steps.length).toBeGreaterThan(0);
  });

  it('les rubriques les plus précises l’emportent', () => {
    expect(helpFor('/app/routines/sc-1/2026-10-01').title).toBe('Exécution d’une routine');
    expect(helpFor('/app/routines').title).toBe('Mes routines');
    expect(helpFor('/andon/ad-1').title).toBe('Détail d’un Andon');
    expect(helpFor('/manager/gemba/nouvelle').title).toBe('Nouvelle Gemba Walk');
  });

  it('le lexique définit chaque terme une seule fois', () => {
    const terms = GLOSSARY.map((g) => g.term);
    expect(new Set(terms).size).toBe(terms.length);
  });
});

import { describe, expect, it } from 'vitest';
import { resolveCatalog } from '@/app/catalog';
import { MODULES } from '@/app/modules';
import { buildDemoData } from '@/data/demo/seed';
import { applySectorTemplate, overrideKey } from '@/features/admin/sectorTemplates';
import { createMemoryStore, createStoreDataSource } from '@/services/data/storeDataSource';
import { SECTOR_KEYS, SECTOR_TEMPLATES, isExampleValue } from './sectors';

/* Clés acceptées par la base (migration 0017) pour les étapes et les catégories */
const KEY = /^[a-z0-9_-]{1,40}$/;

describe('modèles de secteur', () => {
  it.each(SECTOR_KEYS)('%s : contenu valide pour la base et pour l’application', (key) => {
    const t = SECTOR_TEMPLATES[key];
    const catalog = resolveCatalog(t.catalog);
    for (const e of [...catalog.productionStages, ...catalog.anomalyCategories]) expect(e.key).toMatch(KEY);
    expect(new Set(catalog.productionStages.map((s) => s.key)).size).toBe(catalog.productionStages.length);
    expect(t.routines.length).toBeGreaterThan(0);
    const checklistNames = new Set(t.checklists.map((c) => c.name));
    for (const r of t.routines) {
      expect(r.tasks.length).toBeGreaterThan(0);
      expect(r.defaultTime).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      for (const task of r.tasks) {
        if (task.checklist) expect(checklistNames.has(task.checklist)).toBe(true);
        const ids = (task.checks ?? []).map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
        if (task.sampleSize) expect(task.sampleSize).toBeLessThan(ids.length);
        for (const c of task.checks ?? []) if (c.min !== undefined && c.max !== undefined) expect(c.min).toBeLessThan(c.max);
      }
    }
    for (const m of t.disabledModules) expect(MODULES[m]).toBeDefined();
  });

  it('appliquer un modèle : référentiels, checklists et routines, sans doublon à la seconde application', async () => {
    const ds = createStoreDataSource(createMemoryStore(), () => buildDemoData());
    const routinesBefore = (await ds.repo('routineTemplates').list()).length;
    const first = await applySectorTemplate(ds, 'food');
    expect(first).toEqual({ checklists: 1, routines: 6 });
    const settings = (await ds.repo('settings').list())[0]!;
    expect(settings.sectorTemplate).toBe('food');
    expect(settings.catalog?.productionStages?.map((s) => s.label)).toContain('Cuisson');
    expect(settings.disabledModules).toContain('erp');
    const routines = await ds.repo('routineTemplates').list();
    expect(routines.length).toBe(routinesBefore + 6);
    const hygiene = routines.find((r) => r.title === 'Hygiène avant démarrage')!;
    const checklist = (await ds.repo('checklists').list()).find((c) => c.name === 'Hygiène avant démarrage')!;
    expect(hygiene.tasks[0]!.checklistId).toBe(checklist.id);
    expect(hygiene.description).toMatch(/Fréquence conseillée/);
    expect(await applySectorTemplate(ds, 'food')).toEqual({ checklists: 0, routines: 0 });
  });
});

describe('personnalisation avant application', () => {
  it('routines retenues seulement, bornes adaptées, référentiels conservés', async () => {
    const ds = createStoreDataSource(createMemoryStore(), () => buildDemoData());
    const before = (await ds.repo('settings').list())[0]!.catalog;
    const result = await applySectorTemplate(ds, 'plastics', {
      routines: ['Démarrage presse', 'Changement de moule'],
      checklists: [],
      overrides: { [overrideKey('Démarrage presse', 'temp')]: { min: 50, max: 70 } },
      replaceCatalog: false,
      applyModules: false,
    });
    // « Changement de moule » utilise sa checklist : elle est créée même si elle n'est pas cochée ; « Audit 5S » ne l'est pas
    expect(result).toEqual({ checklists: 1, routines: 2 });
    const start = (await ds.repo('routineTemplates').list()).find((r) => r.title === 'Démarrage presse')!;
    const temp = start.tasks.flatMap((t) => t.checks).find((c) => c.id === 'temp')!;
    expect([temp.min, temp.max]).toEqual([50, 70]);
    expect(temp.help).toMatch(/^Repère du modèle/);
    const rosee = start.tasks.flatMap((t) => t.checks).find((c) => c.id === 'rosee')!;
    expect(rosee.help).toMatch(/^Valeur d’exemple à adapter/);
    const settings = (await ds.repo('settings').list())[0]!;
    expect(settings.catalog).toEqual(before);
    expect(settings.sectorTemplate).toBe('plastics');
  });
});

describe('valeurs réglementaires des modèles', () => {
  const check = (sector: keyof typeof SECTOR_TEMPLATES, id: string) =>
    SECTOR_TEMPLATES[sector].routines.flatMap((r) => r.tasks.flatMap((t) => t.checks ?? [])).find((c) => c.id === id)!;
  it('plats cuisinés réfrigérés entre 0 et +3 °C, refroidissement en 2 h au plus, maintien au chaud à 63 °C', () => {
    expect([check('food', 'chambre').min, check('food', 'chambre').max]).toEqual([0, 3]);
    expect(check('food', 'refroidissement').max).toBe(120);
    expect(check('food', 'chaud').min).toBe(63);
  });
  it('ESD : plan de travail sous 1×10⁹ Ω ; les valeurs propres à l’usine sont signalées comme exemples', () => {
    expect(check('electronics', 'plan').max).toBe(1000);
    expect(isExampleValue(check('plastics', 'temp'))).toBe(true);
    expect(isExampleValue(check('food', 'chambre'))).toBe(false);
  });
});

describe('démo par secteur', () => {
  it.each(SECTOR_KEYS.filter((k) => k !== 'automotive'))('%s : atelier habillé pour le secteur, avec historique', (key) => {
    const data = buildDemoData(new Date('2026-10-06T08:05:00Z'), key);
    const settings = data.settings[0]!;
    expect(settings.sectorTemplate).toBe(key);
    const catalog = resolveCatalog(settings.catalog);
    const stages = new Set(catalog.productionStages.map((s) => s.key));
    for (const o of data.productionOrders) expect(stages.has(o.stage)).toBe(true);
    const categories = new Set(catalog.anomalyCategories.map((c) => c.key));
    for (const a of data.anomalies) expect(categories.has(a.category)).toBe(true);
    // Plus aucune routine propre au câblage ; les routines du modèle sont planifiées et ont un historique
    expect(data.routineTemplates.some((r) => /sertissage|dénudage/i.test(r.title))).toBe(false);
    const sectorRoutines = data.routineTemplates.filter((r) => r.id.startsWith('rt-sec-'));
    expect(sectorRoutines.length).toBeGreaterThan(0);
    for (const r of sectorRoutines) expect(data.schedules.some((s) => s.routineId === r.id)).toBe(true);
    expect(data.routineRuns.some((run) => run.templateId.startsWith('rt-sec-'))).toBe(true);
    expect(data.workstations.some((w) => /sertissage/i.test(w.name))).toBe(false);
  });

  it('automobile : l’atelier de câblage d’origine', () => {
    const data = buildDemoData(new Date('2026-10-06T08:05:00Z'));
    expect(data.settings[0]!.plantName).toBe('Atelier de câblage');
    expect(data.routineTemplates.some((r) => r.id === 'rt-ha-crimp')).toBe(true);
  });
});

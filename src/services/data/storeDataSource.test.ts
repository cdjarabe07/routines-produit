import { describe, expect, it } from 'vitest';
import { buildDemoData } from '@/data/demo/seed';
import { NotFoundError, StorageError } from '@/services/errors';
import { createMemoryStore, createStoreDataSource, type KeyValueStore } from './storeDataSource';
import { COLLECTIONS } from './types';

const make = (store: KeyValueStore = createMemoryStore()) =>
  createStoreDataSource(store, () => buildDemoData(new Date('2026-09-29T10:00:00')));

describe('storeDataSource', () => {
  it('charge le jeu de démonstration au premier démarrage', async () => {
    const ds = make();
    expect(ds.kind).toBe('demo');
    expect((await ds.repo('users').list()).length).toBeGreaterThan(5);
    expect(await ds.repo('settings').get('app')).toMatchObject({ andonEscalationMinutes: 10 });
  });

  it('crée, lit, met à jour et supprime une entité', async () => {
    const repo = make().repo('announcements');
    const created = await repo.create({ text: 'Test', date: '2026-09-29', authorId: 'u-karim' });
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBe(created.updatedAt);

    const updated = await repo.update(created.id, { text: 'Modifié' });
    expect(updated.text).toBe('Modifié');
    expect((await repo.get(created.id)).text).toBe('Modifié');

    await repo.remove(created.id);
    await expect(repo.get(created.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('filtre par égalité', async () => {
    const ws = await make()
      .repo('workstations')
      .list({ where: { lineId: 'line-b' } });
    expect(ws.map((w) => w.code).sort()).toEqual(['P5', 'P6', 'P7', 'P8']);
  });

  it('persiste entre deux instances sur le même magasin', async () => {
    const store = createMemoryStore();
    await make(store).repo('announcements').create({ text: 'Persisté', date: '2026-09-29', authorId: 'u-karim' });
    const again = await make(store).repo('announcements').list();
    expect(again.some((a) => a.text === 'Persisté')).toBe(true);
  });

  it('renvoie des copies (pas de mutation du cache par l’appelant)', async () => {
    const repo = make().repo('users');
    const [first] = await repo.list();
    first!.name = 'Muté';
    expect((await repo.get(first!.id)).name).not.toBe('Muté');
  });

  it('réinitialise les données de démonstration', async () => {
    const ds = make();
    await ds.repo('announcements').create({ text: 'À effacer', date: '2026-09-29', authorId: 'u-karim' });
    await ds.resetDemoData!();
    expect((await ds.repo('announcements').list()).some((a) => a.text === 'À effacer')).toBe(false);
  });

  it('signale un stockage plein par une StorageError', async () => {
    const store = createMemoryStore();
    const ds = make(store);
    const full: KeyValueStore = {
      ...store,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const blocked = createStoreDataSource({ ...full, getItem: store.getItem }, () => buildDemoData());
    await expect(blocked.repo('announcements').create({ text: 'x', date: '2026-09-29', authorId: 'u' })).rejects.toBeInstanceOf(
      StorageError,
    );
    expect(ds.kind).toBe('demo');
  });
});

describe('jeu de démonstration', () => {
  const data = buildDemoData(new Date('2026-09-29T10:00:00'));

  it('contient toutes les collections', () => {
    for (const name of COLLECTIONS) expect(Array.isArray(data[name])).toBe(true);
  });

  it('n’a pas de références cassées', () => {
    const users = new Set(data.users.map((u) => u.id));
    const ws = new Set(data.workstations.map((w) => w.id));
    const kb = new Set(data.knowledgeItems.map((k) => k.id));
    const templates = new Set(data.routineTemplates.map((t) => t.id));
    for (const a of data.actions) expect(users.has(a.assigneeId)).toBe(true);
    for (const a of data.anomalies) if (a.workstationId) expect(ws.has(a.workstationId)).toBe(true);
    for (const a of data.andonAlerts) expect(ws.has(a.workstationId)).toBe(true);
    for (const r of data.routineRuns) expect(templates.has(r.templateId)).toBe(true);
    for (const t of data.routineTemplates)
      for (const item of t.sections.flatMap((s) => s.items)) if (item.knowledgeId) expect(kb.has(item.knowledgeId)).toBe(true);
  });

  it('marque les contenus de référence comme exemples', () => {
    expect(data.knowledgeItems.every((k) => k.toReview)).toBe(true);
  });

  it('ne produit aucun horodatage dans le futur', () => {
    const now = new Date('2026-09-29T10:00:00').getTime();
    for (const a of data.andonAlerts) expect(new Date(a.raisedAt).getTime()).toBeLessThanOrEqual(now);
    for (const q of data.qualityChecks) expect(new Date(q.createdAt).getTime()).toBeLessThanOrEqual(now);
  });

  it('est reproductible', () => {
    const again = buildDemoData(new Date('2026-09-29T10:00:00'));
    expect(again.anomalies.length).toBe(data.anomalies.length);
    expect(again.qualityChecks.map((q) => q.value)).toEqual(data.qualityChecks.map((q) => q.value));
  });
});

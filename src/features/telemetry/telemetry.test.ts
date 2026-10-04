import { describe, expect, it } from 'vitest';
import { isNoise, routePattern } from '@/app/telemetry';
import { createMemoryStore } from '@/services/data/storeDataSource';
import {
  MAX_DISTINCT_ERRORS_PER_DAY,
  MAX_USAGE_ROWS_PER_DAY,
  createLocalTelemetry,
  errorFingerprint,
  mergeError,
  mergeView,
} from '@/services/data/telemetryStore';
import type { ClientErrorReport, UsageRow } from '@/services/data/types';
import { unusedScreens, usageByModule, usageByScreen } from './model';

const report = (message: string, route = '/andon'): ClientErrorReport => ({
  message,
  route,
  source: 'window',
  stack: `Error: ${message}\n    at f (app.js:1:2)`,
});

describe('Suivi — modèle d’adresse', () => {
  it('remplace les valeurs des paramètres par leur nom (aucun identifiant conservé)', () => {
    expect(routePattern('/actions/ac-42', { id: 'ac-42' })).toBe('/actions/:id');
    expect(routePattern('/app/routines/sc-1/2026-10-04', { scheduleId: 'sc-1', date: '2026-10-04' })).toBe(
      '/app/routines/:scheduleId/:date',
    );
    expect(routePattern('/manager', {})).toBe('/manager');
    expect(routePattern('/nimporte/quoi', { '*': 'nimporte/quoi' })).toBe('/introuvable');
  });

  it('ignore le bruit des extensions et des avertissements bénins', () => {
    expect(isNoise('ResizeObserver loop completed with undelivered notifications.')).toBe(true);
    expect(isNoise('Script error.')).toBe(true);
    expect(isNoise('x', 'at chrome-extension://abc/content.js')).toBe(true);
    expect(isNoise('Cannot read properties of undefined')).toBe(false);
  });
});

describe('Suivi — regroupement et plafonds', () => {
  it('une même erreur le même jour est comptée, pas dupliquée', () => {
    let rows = mergeError([], report('Boom'), 'operator', '2026-10-04', 't1');
    rows = mergeError(rows, report('Boom'), 'operator', '2026-10-04', 't2');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ count: 2, firstAt: 't1', lastAt: 't2' });
    rows = mergeError(rows, report('Boom'), 'operator', '2026-10-05', 't3');
    expect(rows).toHaveLength(2);
  });

  it('l’empreinte dépend du message, du premier appel et de l’écran', () => {
    expect(errorFingerprint(report('A'))).toHaveLength(32);
    expect(errorFingerprint(report('A'))).toBe(errorFingerprint(report('A')));
    expect(errorFingerprint(report('A'))).not.toBe(errorFingerprint(report('A', '/manager')));
  });

  it('plafonne les erreurs distinctes par jour, mais continue de compter les connues', () => {
    let rows = Array.from({ length: MAX_DISTINCT_ERRORS_PER_DAY }, (_, i) => i).reduce(
      (acc, i) => mergeError(acc, report(`E${i}`), 'admin', '2026-10-04', 't'),
      [] as ReturnType<typeof mergeError>,
    );
    rows = mergeError(rows, report('Nouvelle'), 'admin', '2026-10-04', 't');
    expect(rows).toHaveLength(MAX_DISTINCT_ERRORS_PER_DAY);
    rows = mergeError(rows, report('E0'), 'admin', '2026-10-04', 't');
    expect(rows.find((r) => r.message === 'E0')!.count).toBe(2);
  });

  it('compte les vues par jour, écran et rôle ; refuse les adresses invalides', () => {
    let rows: UsageRow[] = [];
    rows = mergeView(rows, '/andon', 'operator', '2026-10-04');
    rows = mergeView(rows, '/andon', 'operator', '2026-10-04');
    rows = mergeView(rows, '/andon', 'manager', '2026-10-04');
    rows = mergeView(rows, 'javascript:alert(1)', 'manager', '2026-10-04');
    expect(rows).toEqual([
      { day: '2026-10-04', route: '/andon', role: 'operator', views: 2 },
      { day: '2026-10-04', route: '/andon', role: 'manager', views: 1 },
    ]);
    const full = Array.from({ length: MAX_USAGE_ROWS_PER_DAY }, (_, i) => ({
      day: '2026-10-04',
      route: `/r${i}`,
      role: 'admin',
      views: 1,
    }));
    expect(mergeView(full, '/autre', 'admin', '2026-10-04')).toHaveLength(MAX_USAGE_ROWS_PER_DAY);
  });

  it('le stockage local relit uniquement la période demandée', async () => {
    let day = '2026-10-01';
    const telemetry = createLocalTelemetry(createMemoryStore(), () => day);
    await telemetry.trackView('/andon', 'operator');
    await telemetry.reportError(report('Boom'), 'operator');
    day = '2026-10-04';
    await telemetry.trackView('/manager', 'manager');
    expect((await telemetry.usage('2026-10-02')).map((r) => r.route)).toEqual(['/manager']);
    expect(await telemetry.errors('2026-10-02')).toHaveLength(0);
    expect((await telemetry.errors('2026-10-01'))[0]).not.toHaveProperty('fingerprint');
  });
});

describe('Suivi — analyse de la fréquentation', () => {
  const rows: UsageRow[] = [
    { day: '2026-10-03', route: '/andon', role: 'operator', views: 5 },
    { day: '2026-10-04', route: '/andon', role: 'manager', views: 2 },
    { day: '2026-10-04', route: '/gemba/:id', role: 'manager', views: 1 },
  ];

  it('agrège par écran avec le détail par rôle et un nom lisible', () => {
    const [first] = usageByScreen(rows);
    expect(first).toMatchObject({ route: '/andon', views: 7, byRole: { operator: 5, manager: 2 }, lastDay: '2026-10-04' });
    expect(first!.label.length).toBeGreaterThan(0);
  });

  it('agrège par module, modules jamais ouverts compris', () => {
    const modules = usageByModule(rows);
    expect(modules.find((m) => m.module === 'gemba')!.views).toBe(1);
    expect(modules.find((m) => m.module === 'quality')!.views).toBe(0);
  });

  it('liste les écrans du menu jamais ouverts', () => {
    const unused = unusedScreens(rows, [
      { path: '/andon', label: 'Andon', space: '' },
      { path: '/manager/qualite', label: 'Contrôles LQC', space: 'Supervision' },
    ]);
    expect(unused).toEqual([{ path: '/manager/qualite', label: 'Contrôles LQC', space: 'Supervision' }]);
  });
});

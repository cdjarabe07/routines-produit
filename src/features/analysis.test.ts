import { describe, expect, it } from 'vitest';
import { buildDemoData } from '@/data/demo/seed';
import { ALL_PERMISSIONS, roleCan } from '@/services/auth/permissions';
import { buildDailyReport, buildPriorities, lineStatuses, type CockpitData } from './dashboard/model';
import { computeKpis, coverage, delta, previousPeriod, resolvePeriod, toCsv } from './reporting/model';

const NOW = new Date(2026, 8, 29, 10, 0);
const data = buildDemoData(NOW);
const lookupName = (id?: string) => data.workstations.find((w) => w.id === id)?.name ?? '—';

function cockpit(userId: string): CockpitData {
  const user = data.users.find((u) => u.id === userId)!;
  return {
    user,
    now: NOW,
    today: '2026-09-29',
    can: (p) => roleCan(user.role, p),
    lines: data.lines,
    workstations: data.workstations,
    alerts: data.andonAlerts,
    actions: data.actions,
    anomalies: data.anomalies,
    templates: data.routineTemplates,
    runs: data.routineRuns,
    meetings: data.meetings,
    stocks: data.materialStocks,
    orders: data.productionOrders,
    handovers: data.handovers,
    checks: data.qualityChecks,
    escalationMinutes: 10,
    toleranceMinutes: 120,
    workstationName: lookupName,
  };
}

describe('permissions', () => {
  it('l’opérateur signale et déclenche, mais ne voit ni reporting ni administration', () => {
    expect(roleCan('operator', 'anomaly.create')).toBe(true);
    expect(roleCan('operator', 'andon.raise')).toBe(true);
    expect(roleCan('operator', 'reporting.view')).toBe(false);
    expect(roleCan('operator', 'admin.access')).toBe(false);
  });
  it('l’administrateur a toutes les permissions ; seul lui accède à l’administration', () => {
    for (const p of ALL_PERMISSIONS) expect(roleCan('admin', p)).toBe(true);
    expect(roleCan('manager', 'admin.access')).toBe(false);
  });
});

describe('cockpit', () => {
  it('place l’Andon en attente en premier', () => {
    const priorities = buildPriorities(cockpit('u-karim'));
    expect(priorities[0]?.title).toMatch(/Andon qualité — Poste 1/);
    expect(priorities[0]?.level).toBe('critical');
  });

  it('adapte les priorités aux droits : l’opérateur ne voit pas les stocks ni la réunion', () => {
    const ids = buildPriorities(cockpit('u-nadia')).map((p) => p.id);
    expect(ids.some((id) => id === 'stocks' || id.startsWith('meeting-'))).toBe(false);
    expect(buildPriorities(cockpit('u-karim')).some((p) => p.id === 'stocks')).toBe(true);
  });

  it('une ligne avec un Andon en attente est à l’arrêt', () => {
    const statuses = lineStatuses(cockpit('u-karim'));
    expect(statuses.find((s) => s.line.id === 'line-a')?.state).toBe('stopped');
  });

  it('le rapport du jour cite l’atelier et les indicateurs', () => {
    const text = buildDailyReport(cockpit('u-karim'), 'Atelier test');
    expect(text).toContain('RAPPORT DU JOUR — Atelier test');
    expect(text).toContain('Andon déclenchés aujourd’hui');
  });
});

describe('reporting', () => {
  it('résout les périodes prédéfinies et personnalisées', () => {
    expect(resolvePeriod('7d', '2026-09-29')).toMatchObject({ from: '2026-09-23', to: '2026-09-29' });
    expect(resolvePeriod('month', '2026-09-29').from).toBe('2026-09-01');
    expect(resolvePeriod('custom', '2026-09-29', { from: '2026-09-10', to: '2026-09-12' })).toMatchObject({
      from: '2026-09-10',
      to: '2026-09-12',
    });
    // Période personnalisée incohérente → retour aux 7 derniers jours
    expect(resolvePeriod('custom', '2026-09-29', { from: '2026-09-12', to: '2026-09-10' }).label).toBe('7 derniers jours');
  });

  it('la période précédente a la même durée et précède immédiatement', () => {
    expect(previousPeriod({ from: '2026-09-23', to: '2026-09-29', label: '' })).toMatchObject({ from: '2026-09-16', to: '2026-09-22' });
  });

  it('calcule des indicateurs cohérents sur le jeu de démonstration', () => {
    const src = {
      templates: data.routineTemplates,
      runs: data.routineRuns,
      anomalies: data.anomalies,
      actions: data.actions,
      alerts: data.andonAlerts,
      checks: data.qualityChecks,
      workstations: data.workstations,
    };
    const period = resolvePeriod('30d', '2026-09-29');
    const k = computeKpis(src, period);
    expect(k.routinePct).toBeGreaterThan(50);
    expect(k.anomalies).toBeGreaterThan(10);
    expect(k.qualityPct).toBeGreaterThan(90);
    const lineA = computeKpis(src, period, { lineId: 'line-a' });
    expect(lineA.anomalies).toBeLessThan(k.anomalies);
    expect(coverage(src, previousPeriod(period))).toBe(0); // pas d'historique avant 30 jours
  });

  it('variation : sens favorable selon l’indicateur', () => {
    expect(delta(5, 3, false)).toMatchObject({ favorable: false });
    expect(delta(95, 90, true, 'pts')).toMatchObject({ favorable: true, text: '+5,0 pt vs période préc.' });
    expect(delta(null, 3, true)).toBeUndefined();
  });

  it('export CSV au format Excel français', () => {
    const csv = toCsv([{ date: '2026-09-29', routinePct: 87.5, anomalies: 2, andon: 1, actionsClosed: 3, qualityPct: null }]);
    expect(csv.split('\r\n')[1]).toBe('2026-09-29;87,5;2;1;3;');
  });
});

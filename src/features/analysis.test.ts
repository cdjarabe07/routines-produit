import { describe, expect, it } from 'vitest';
import { buildDemoData } from '@/data/demo/seed';
import { PERMISSION_GROUPS, homePath, roleCan } from '@/services/auth/permissions';
import { can as authorize } from '@/services/auth/policies';
import { buildDailyReport, buildPriorities, dayIndicators, lineStatuses, type CockpitData } from './dashboard/model';
import { occurrencesBetween } from './planning/model';
import { computeKpis, coverage, delta, previousPeriod, resolvePeriod, toCsv } from './reporting/model';

const NOW = new Date(2026, 8, 29, 10, 0);
const data = buildDemoData(NOW);
const lookupName = (id?: string) => data.workstations.find((w) => w.id === id)?.name ?? '—';
const occurrenceSource = { schedules: data.schedules, routines: data.routineTemplates, runs: data.routineRuns };

function cockpit(userId: string): CockpitData {
  const user = data.users.find((u) => u.id === userId)!;
  return {
    user,
    now: NOW,
    today: '2026-09-29',
    can: (p, resource) => authorize(user, p, resource),
    lines: data.lines,
    workstations: data.workstations,
    alerts: data.andonAlerts,
    actions: data.actions,
    anomalies: data.anomalies,
    occurrences: occurrencesBetween(occurrenceSource, '2026-09-29', '2026-09-29'),
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
    expect(roleCan('operator', 'space.admin')).toBe(false);
    expect(roleCan('operator', 'space.supervision')).toBe(false);
    expect(roleCan('operator', 'routine.execute')).toBe(true);
  });
  it('l’administrateur a toutes les permissions ; le manager planifie mais ne configure pas', () => {
    for (const p of PERMISSION_GROUPS.flatMap((g) => g.permissions)) expect(roleCan('admin', p)).toBe(true);
    expect(roleCan('manager', 'schedule.manage')).toBe(true);
    expect(roleCan('manager', 'meeting.manage')).toBe(true);
    for (const p of ['routine.manage', 'user.manage', 'settings.manage', 'knowledge.manage'] as const)
      expect(roleCan('manager', p)).toBe(false);
  });
  it('chaque rôle a un profil et un écran d’accueil', () => {
    expect(homePath('admin')).toBe('/admin/dashboard');
    expect(homePath('manager')).toBe('/manager');
    expect(homePath('line_leader')).toBe('/manager');
    expect(homePath('operator')).toBe('/app');
    expect(homePath('quality')).toBe('/app');
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

  it('les routines du jour sont calculées depuis la planification', () => {
    const ind = dayIndicators(cockpit('u-dupont'));
    expect(ind.routines.planned).toBeGreaterThan(5);
    // Laissées à faire par le jeu initial : le contrôle début de poste de l'équipe A n'est pas démarré
    expect(ind.routines.done).toBeLessThan(ind.routines.planned);
    expect(buildPriorities(cockpit('u-dupont')).some((p) => p.id === 'team-late' || p.id.startsWith('andon-'))).toBe(true);
  });

  it('les routines personnelles apparaissent dans les priorités du Line Leader', () => {
    expect(buildPriorities(cockpit('u-karim')).some((p) => p.id.startsWith('routine-sc-ll-audit'))).toBe(true);
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
      ...occurrenceSource,
      anomalies: data.anomalies,
      actions: data.actions,
      alerts: data.andonAlerts,
      checks: data.qualityChecks,
      workstations: data.workstations,
    };
    const period = resolvePeriod('30d', '2026-09-29');
    const k = computeKpis(src, period, {}, { toleranceMin: 120, now: NOW });
    expect(k.routinesPlanned).toBeGreaterThan(200);
    expect(k.routinesDone + k.routinesInProgress + k.routinesLate + k.routinesPending).toBe(k.routinesPlanned);
    expect(k.routinePct).toBeGreaterThan(70);
    expect(k.avgRoutineMin).not.toBeNull();
    expect(k.anomalies).toBeGreaterThan(10);
    expect(k.qualityPct).toBeGreaterThan(90);
    const lineA = computeKpis(src, period, { lineId: 'line-a' }, { toleranceMin: 120, now: NOW });
    expect(lineA.anomalies).toBeLessThan(k.anomalies);
    expect(lineA.routinesPlanned).toBeLessThan(k.routinesPlanned);
    expect(coverage(src, previousPeriod(period))).toBe(0); // pas d'historique avant 30 jours
  });

  it('variation : sens favorable selon l’indicateur', () => {
    expect(delta(5, 3, false)).toMatchObject({ favorable: false });
    expect(delta(95, 90, true, 'pts')).toMatchObject({ favorable: true, text: '+5,0 pt vs période préc.' });
    expect(delta(null, 3, true)).toBeUndefined();
  });

  it('export CSV au format Excel français', () => {
    const csv = toCsv([
      {
        date: '2026-09-29',
        routinesPlanned: 8,
        routinesDone: 7,
        routinePct: 87.5,
        anomalies: 2,
        andon: 1,
        actionsClosed: 3,
        qualityPct: null,
      },
    ]);
    expect(csv.split('\r\n')[1]).toBe('2026-09-29;8;7;87,5;2;1;3;');
  });
});

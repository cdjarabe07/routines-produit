import { describe, expect, it } from 'vitest';
import type { Permission } from '@/services/auth/permissions';
import type { Action, AndonAlert, Line, ProductionOrder, Workstation } from '@/types/domain';
import { productionFlow, stageOfStation, workMetrics } from './model';
import { PROCESS_STAGES, linkFor } from './nodes';

const base = { createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z' };

const line: Line = { ...base, id: 'l1', code: 'A', name: 'Ligne A' };
const station = (id: string, code: string, process: string, active = true): Workstation =>
  ({ ...base, id, code, name: `Poste ${code}`, process, lineId: 'l1', active, mapX: 0, mapY: 0 }) as Workstation;
const order = (p: Partial<ProductionOrder>): ProductionOrder =>
  ({
    ...base,
    id: 'o',
    reference: 'OF',
    harnessRef: 'H',
    lineId: 'l1',
    quantityPlanned: 10,
    quantityDone: 0,
    stage: 'cutting',
    status: 'in_progress',
    dueDate: '2026-10-03',
    ...p,
  }) as ProductionOrder;

describe('Carte du processus — flux de fabrication', () => {
  it('reconnaît l’étape d’un poste par son procédé', () => {
    expect(stageOfStation({ process: 'Sertissage' })).toBe('crimping');
    expect(stageOfStation({ process: ' test électrique ' })).toBe('electrical_test');
    expect(stageOfStation({ process: 'Peinture' })).toBeNull();
  });

  it('ordonne les postes dans l’ordre de fabrication et compte les OF', () => {
    const flows = productionFlow({
      lines: [line, { ...line, id: 'l2', name: 'Ligne vide' }],
      workstations: [
        station('w3', 'P3', 'Assemblage'),
        station('w1', 'P1', 'Sertissage'),
        station('w2', 'P2', 'Coupe'),
        station('w9', 'P9', 'Inconnu'),
        station('w0', 'P0', 'Coupe', false),
      ],
      orders: [order({ stage: 'crimping' }), order({ stage: 'crimping', status: 'blocked' }), order({ stage: 'crimping', status: 'done' })],
      alerts: [],
      stocks: [],
      anomalies: [],
    });
    expect(flows).toHaveLength(1); // ligne sans poste masquée
    expect(flows[0]!.stations.map((s) => s.station.code)).toEqual(['P2', 'P1', 'P3', 'P9']);
    const crimping = flows[0]!.stations[1]!;
    expect(crimping.ordersHere).toBe(2);
    expect(crimping.blockedHere).toBe(1);
  });
});

describe('Carte du processus — organisation du travail', () => {
  it('signale les retards et alertes par un ton', () => {
    const m = workMetrics({
      today: '2026-10-03',
      now: new Date('2026-10-03T10:00:00Z'),
      toleranceMin: 15,
      routines: [],
      schedules: [],
      occurrencesToday: [],
      meetings: [],
      alerts: [{ ...base, id: 'a', status: 'active' } as AndonAlert, { ...base, id: 'b', status: 'resolved' } as AndonAlert],
      anomalies: [],
      checksToday: [],
      actions: [{ ...base, id: 'x', status: 'todo', dueDate: '2026-10-01' } as unknown as Action],
    });
    expect(m.andon![0]).toMatchObject({ value: 1, tone: 'warning' });
    expect(m.actions!.find((x) => x.label === 'en retard')).toMatchObject({ value: 1, tone: 'danger' });
    expect(m.anomalies![1]!.tone).toBeUndefined();
  });

  it('chaque nœud chiffré correspond à un groupe de chiffres', () => {
    const keys = PROCESS_STAGES.flatMap((s) => s.nodes).flatMap((n) => (n.metrics ? [n.metrics] : []));
    const m = workMetrics({
      today: '2026-10-03',
      now: new Date(),
      toleranceMin: 15,
      routines: [],
      schedules: [],
      occurrencesToday: [],
      meetings: [],
      alerts: [],
      anomalies: [],
      checksToday: [],
      actions: [],
    });
    for (const k of keys) expect(m[k]).toBeDefined();
  });

  it('le lien d’un nœud dépend des droits', () => {
    const node = PROCESS_STAGES.flatMap((s) => s.nodes).find((n) => n.key === 'actions')!;
    const operator = (p: Permission) => ['space.app', 'action.update'].includes(p);
    const manager = (p: Permission) => ['space.supervision', 'action.manage', 'space.app'].includes(p);
    expect(linkFor(node, operator)).toBe('/app/actions');
    expect(linkFor(node, manager)).toBe('/manager/actions');
    expect(linkFor(node, () => false)).toBeNull();
    // can() reçoit la permission seule : un second argument serait lu comme une ressource
    const strict = (...args: unknown[]) => args.length === 1 && operator(args[0] as Permission);
    expect(linkFor(node, strict)).toBe('/app/actions');
  });
});

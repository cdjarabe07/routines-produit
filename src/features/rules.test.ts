/* Règles métier pures : un fichier de tests par domaine regroupé ici pour la lisibilité.
   Chaque bloc correspond à un features/<module>/model.ts. */

import { describe, expect, it } from 'vitest';
import type { Action, AndonAlert, Leave, PresenceRecord, RoutineRun, RoutineTemplate } from '@/types/domain';
import { canUpdateAction, defaultDueDate, filterActions, isOverdue, sortActions } from './actions/model';
import { andonStats, isEscalated, worstOpenAlert } from './andon/model';
import { validationErrors } from './gemba/model';
import { needsReorder, stockState } from './production/model';
import { conformity, isConform } from './quality/model';
import { canEditRun, dayCompletion, routineState, runProgress } from './routines/model';
import { abortRun, nextStep, pauseRun, previousStep, resumeRun, startRun, stepElapsedMs, totalElapsedMs } from './sequences/model';
import { memberStatus } from './team/model';

const base = { createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z' };

const action = (p: Partial<Action>): Action => ({
  ...base, id: p.id ?? 'a', title: 'x', assigneeId: 'u1', priority: 'medium', status: 'todo', dueDate: '2026-09-29',
  source: { type: 'manual' }, createdBy: 'u9', ...p,
});

describe('actions', () => {
  it('une action est en retard seulement si ouverte et échue', () => {
    expect(isOverdue(action({ dueDate: '2026-09-28' }), '2026-09-29')).toBe(true);
    expect(isOverdue(action({ dueDate: '2026-09-29' }), '2026-09-29')).toBe(false);
    expect(isOverdue(action({ dueDate: '2026-09-01', status: 'done' }), '2026-09-29')).toBe(false);
    expect(isOverdue(action({ dueDate: '2026-09-01', status: 'cancelled' }), '2026-09-29')).toBe(false);
  });

  it('filtre « mes actions » sur le responsable et le suppléant', () => {
    const list = [action({ id: '1' }), action({ id: '2', assigneeId: 'u2', backupId: 'u1' }), action({ id: '3', assigneeId: 'u2' }), action({ id: '4', status: 'done' })];
    expect(filterActions(list, 'mine', 'u1', '2026-09-29').map((a) => a.id)).toEqual(['1', '2']);
    expect(filterActions(list, 'closed', 'u1', '2026-09-29').map((a) => a.id)).toEqual(['4']);
  });

  it('trie : retard, puis priorité, puis échéance', () => {
    const list = [
      action({ id: 'low', priority: 'low', dueDate: '2026-09-30' }),
      action({ id: 'late', priority: 'low', dueDate: '2026-09-20' }),
      action({ id: 'crit', priority: 'critical', dueDate: '2026-10-05' }),
    ];
    expect(sortActions(list, '2026-09-29').map((a) => a.id)).toEqual(['late', 'crit', 'low']);
  });

  it('échéance par défaut selon la gravité (règle du prototype)', () => {
    expect(defaultDueDate('critical', '2026-09-29')).toBe('2026-09-30');
    expect(defaultDueDate('major', '2026-09-29')).toBe('2026-10-02');
    expect(defaultDueDate('minor', '2026-09-29')).toBe('2026-10-06');
  });

  it('seuls responsable, suppléant, créateur ou encadrement modifient le statut', () => {
    const a = action({ assigneeId: 'u1', backupId: 'u2', createdBy: 'u3' });
    expect(canUpdateAction(a, 'u2', false)).toBe(true);
    expect(canUpdateAction(a, 'u4', false)).toBe(false);
    expect(canUpdateAction(a, 'u4', true)).toBe(true);
  });
});

const template: RoutineTemplate = {
  ...base, id: 't', title: 'Routine', role: 'line_leader', scheduledTime: '08:00', active: true,
  sections: [{ id: 's', title: 'S', items: [{ id: 'i1', label: 'A' }, { id: 'i2', label: 'B' }] }],
};
const run = (results: RoutineRun['results']): RoutineRun => ({ ...base, id: 'r', templateId: 't', date: '2026-09-29', assigneeId: 'u1', results });
const at = (h: number, m = 0) => new Date(2026, 8, 29, h, m);

describe('routines', () => {
  const ok = { status: 'ok' as const, at: base.createdAt, by: 'u1' };

  it('calcule l’avancement par statut', () => {
    expect(runProgress(template, run({ i1: ok, i2: { ...ok, status: 'ko' } }))).toEqual({ total: 2, treated: 2, ok: 1, ko: 1, na: 0 });
    expect(runProgress(template)).toMatchObject({ total: 2, treated: 0 });
  });

  it('prévue → à faire → en retard selon l’heure et la tolérance', () => {
    expect(routineState(template, undefined, '2026-09-29', '2026-09-29', at(7, 59), 120)).toBe('upcoming');
    expect(routineState(template, undefined, '2026-09-29', '2026-09-29', at(9, 0), 120)).toBe('due');
    expect(routineState(template, undefined, '2026-09-29', '2026-09-29', at(10, 1), 120)).toBe('late');
    expect(routineState(template, run({ i1: ok, i2: ok }), '2026-09-29', '2026-09-29', at(23), 120)).toBe('done');
    expect(routineState(template, run({ i1: ok }), '2026-09-28', '2026-09-29', at(7), 120)).toBe('late');
  });

  it('agrège la réalisation d’une journée', () => {
    expect(dayCompletion([template], [run({ i1: ok })], '2026-09-29')).toEqual({ total: 2, treated: 1, completedRoutines: 0, routines: 1 });
  });

  it('saisie réservée au jour courant et au rôle (sauf gestionnaire)', () => {
    expect(canEditRun(template, 'line_leader', false, '2026-09-29', '2026-09-29')).toBe(true);
    expect(canEditRun(template, 'hancho', false, '2026-09-29', '2026-09-29')).toBe(false);
    expect(canEditRun(template, 'manager', true, '2026-09-29', '2026-09-29')).toBe(true);
    expect(canEditRun(template, 'line_leader', false, '2026-09-28', '2026-09-29')).toBe(false);
  });
});

describe('séquences guidées', () => {
  const tpl = { ...base, id: 's', name: 'S', active: true, steps: [{ id: 'a', title: 'A', durationMin: 2 }, { id: 'b', title: 'B', durationMin: 3 }] };
  const t = (sec: number) => new Date(Date.UTC(2026, 8, 29, 8, 0, sec));

  it('mesure le temps à partir des horodatages, pause comprise', () => {
    let r = startRun(tpl, 'u1', t(0));
    expect(stepElapsedMs(r, 0, t(30))).toBe(30_000);
    r = pauseRun(r, t(30));
    expect(stepElapsedMs(r, 0, t(90))).toBe(30_000); // figé pendant la pause
    r = resumeRun(r, t(90));
    expect(stepElapsedMs(r, 0, t(100))).toBe(40_000);
  });

  it('enchaîne les étapes puis termine', () => {
    let r = startRun(tpl, 'u1', t(0));
    r = nextStep(r, t(10));
    expect(r.currentStepIndex).toBe(1);
    expect(r.steps[0]!.completedAt).toBeDefined();
    r = nextStep(r, t(25));
    expect(r.status).toBe('completed');
    expect(totalElapsedMs(r, t(999))).toBe(25_000);
  });

  it('retour arrière : l’étape redevient à faire, le temps est conservé', () => {
    let r = startRun(tpl, 'u1', t(0));
    r = nextStep(r, t(10));
    r = previousStep(r, t(15));
    expect(r.currentStepIndex).toBe(0);
    expect(r.steps[0]!.completedAt).toBeUndefined();
    expect(stepElapsedMs(r, 1, t(20))).toBe(5_000);
    expect(stepElapsedMs(r, 0, t(20))).toBe(15_000);
  });

  it('abandon : état final, plus de transition possible', () => {
    const r = abortRun(startRun(tpl, 'u1', t(0)), t(5));
    expect(r.status).toBe('aborted');
    expect(nextStep(r, t(6))).toBe(r);
  });
});

const alert = (p: Partial<AndonAlert>): AndonAlert => ({
  ...base, id: p.id ?? 'x', workstationId: 'w1', type: 'quality', urgency: 'normal', detail: 'd', status: 'active', raisedBy: 'u', raisedAt: '2026-09-29T08:00:00.000Z', ...p,
});

describe('andon', () => {
  const now = new Date('2026-09-29T08:12:00.000Z');
  it('escalade après le seuil sans prise en charge', () => {
    expect(isEscalated(alert({}), now, 10)).toBe(true);
    expect(isEscalated(alert({}), now, 15)).toBe(false);
    expect(isEscalated(alert({ status: 'acknowledged' }), now, 10)).toBe(false);
  });

  it('retient l’alerte la plus grave d’un poste', () => {
    const list = [alert({ id: 'ack', status: 'acknowledged' }), alert({ id: 'wait' }), alert({ id: 'crit', urgency: 'critical', status: 'acknowledged' })];
    expect(worstOpenAlert(list, 'w1')?.id).toBe('crit');
    expect(worstOpenAlert([alert({ status: 'resolved' })], 'w1')).toBeUndefined();
  });

  it('moyennes de prise en charge et de résolution', () => {
    const stats = andonStats([
      alert({ status: 'resolved', acknowledgedAt: '2026-09-29T08:04:00.000Z', resolvedAt: '2026-09-29T08:20:00.000Z' }),
      alert({ status: 'resolved', acknowledgedAt: '2026-09-29T08:06:00.000Z', resolvedAt: '2026-09-29T08:30:00.000Z' }),
    ]);
    expect(stats).toEqual({ count: 2, avgAcknowledgeMin: 5, avgResolutionMin: 25 });
  });
});

describe('équipe', () => {
  const leaves: Leave[] = [{ ...base, id: 'l', userId: 'u1', from: '2026-09-28', to: '2026-09-30' }];
  const presence: PresenceRecord[] = [{ ...base, id: 'p', userId: 'u1', date: '2026-10-01', status: 'present', recordedBy: 'x' }];
  it('le congé est prioritaire et calculé', () => {
    expect(memberStatus('u1', '2026-09-29', presence, leaves)).toBe('on_leave');
  });
  it('à la fin du congé, la présence saisie s’applique (bug du prototype corrigé)', () => {
    expect(memberStatus('u1', '2026-10-01', presence, leaves)).toBe('present');
    expect(memberStatus('u1', '2026-10-02', presence, leaves)).toBe('unknown');
  });
});

describe('stocks et qualité', () => {
  const stock = (quantity: number) => ({ ...base, id: 's', material: 'm', workstationId: 'w', quantity, min: 10, target: 40, unit: 'pcs' });
  it('états kanban', () => {
    expect([0, 5, 20, 40].map((q) => stockState(stock(q)))).toEqual(['out', 'reorder', 'watch', 'healthy']);
    expect(needsReorder(stock(9))).toBe(true);
  });
  it('conformité LQC', () => {
    expect(isConform({ value: 10, min: 10, max: 12 })).toBe(true);
    expect(isConform({ value: 12.01, min: 10, max: 12 })).toBe(false);
    expect(conformity([])).toBeNull();
  });
});

describe('gemba', () => {
  it('bloque la validation sans zone, sans checklist ou avec un KO non commenté', () => {
    const errors = validationErrors({ zone: '', checklist: [{ id: '1', label: 'x', result: 'ko' }], observations: [] });
    expect(errors).toHaveLength(2);
    expect(validationErrors({ zone: 'Z', checklist: [{ id: '1', label: 'x', result: 'ko', comment: 'vu' }], observations: [] })).toEqual([]);
  });
});

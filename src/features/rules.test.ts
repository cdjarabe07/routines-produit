/* Règles métier pures : un fichier de tests par domaine regroupé ici pour la lisibilité.
   Chaque bloc correspond à un features/<module>/model.ts. */

import { describe, expect, it } from 'vitest';
import type { Action, AndonAlert, Checklist, Leave, PresenceRecord, RoutineRun, RoutineTemplate, Schedule, User } from '@/types/domain';
import { can } from '@/services/auth/policies';
import { defaultDueDate, filterActions, isOverdue, sortActions } from './actions/model';
import { andonStats, isEscalated, worstOpenAlert } from './andon/model';
import { validationErrors } from './gemba/model';
import { needsReorder, stockState } from './production/model';
import { conformity, isConform } from './quality/model';
import { checkKey, evaluateCheck, runSummary, taskChecks, taskProgress } from './routines/model';
import { completedOnTime, countOccurrences, isAssignedTo, occurrenceState, occurrencesBetween, occursOn } from './planning/model';
import {
  abortRun,
  nextStep,
  pauseRun,
  previousStep,
  resumeRun,
  runSteps,
  startRun,
  stepElapsedMs,
  totalElapsedMs,
} from './sequences/model';
import { memberStatus } from './team/model';

const base = { createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z' };

const action = (p: Partial<Action>): Action => ({
  ...base,
  id: p.id ?? 'a',
  title: 'x',
  assigneeId: 'u1',
  priority: 'medium',
  status: 'todo',
  dueDate: '2026-09-29',
  source: { type: 'manual' },
  createdBy: 'u9',
  ...p,
});

describe('actions', () => {
  it('une action est en retard seulement si ouverte et échue', () => {
    expect(isOverdue(action({ dueDate: '2026-09-28' }), '2026-09-29')).toBe(true);
    expect(isOverdue(action({ dueDate: '2026-09-29' }), '2026-09-29')).toBe(false);
    expect(isOverdue(action({ dueDate: '2026-09-01', status: 'done' }), '2026-09-29')).toBe(false);
    expect(isOverdue(action({ dueDate: '2026-09-01', status: 'cancelled' }), '2026-09-29')).toBe(false);
  });

  it('filtre « mes actions » sur le responsable et le suppléant', () => {
    const list = [
      action({ id: '1' }),
      action({ id: '2', assigneeId: 'u2', backupId: 'u1' }),
      action({ id: '3', assigneeId: 'u2' }),
      action({ id: '4', status: 'done' }),
    ];
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
    const person = (id: string, role: User['role']): User => ({ ...base, id, name: id, email: `${id}@x`, role, active: true });
    const res = { type: 'action' as const, action: a };
    expect(can(person('u2', 'operator'), 'action.update', res)).toBe(true);
    expect(can(person('u4', 'operator'), 'action.update', res)).toBe(false);
    expect(can(person('u4', 'line_leader'), 'action.update', res)).toBe(true);
    expect(can({ ...person('u2', 'operator'), active: false }, 'action.update', res)).toBe(false);
  });
});

const checklist: Checklist = {
  ...base,
  id: 'cl',
  name: 'EPI',
  active: true,
  items: [{ id: 'gants', label: 'Gants', type: 'conformity', required: true }],
};
const checklists = new Map([[checklist.id, checklist]]);
const template: RoutineTemplate = {
  ...base,
  id: 't',
  title: 'Contrôle début de poste',
  durationMin: 20,
  defaultTime: '08:00',
  active: true,
  tasks: [
    { id: 'simple', title: 'Vérifier le poste', priority: 'high', required: true, checks: [] },
    {
      id: 'outils',
      title: 'Vérifier les outils',
      priority: 'high',
      required: true,
      checklistId: 'cl',
      checks: [{ id: 'h', label: 'Hauteur', type: 'number', required: true, min: 1.42, max: 1.52, unit: 'mm' }],
    },
    {
      id: 'docs',
      title: 'Documents',
      priority: 'medium',
      required: false,
      checks: [{ id: 'ref', label: 'Indice', type: 'text', required: false }],
    },
  ],
};
const schedule = (p: Partial<Schedule> = {}): Schedule => ({
  ...base,
  id: 'sc',
  routineId: 't',
  startDate: '2026-09-21',
  time: '08:00',
  recurrence: 'weekdays',
  weekdays: [],
  assigneeId: 'u1',
  status: 'active',
  skippedDates: [],
  createdBy: 'admin',
  ...p,
});
const run = (results: RoutineRun['results'], extra: Partial<RoutineRun> = {}): RoutineRun => ({
  ...base,
  id: 'r',
  scheduleId: 'sc',
  templateId: 't',
  date: '2026-09-29',
  assigneeId: 'u1',
  startedAt: '2026-09-29T06:05:00.000Z',
  results,
  ...extra,
});
const at = (h: number, m = 0) => new Date(2026, 8, 29, h, m);

describe('planification', () => {
  it('produit les occurrences selon la répétition (29/09/2026 est un mardi)', () => {
    expect(occursOn(schedule(), '2026-09-29')).toBe(true);
    expect(occursOn(schedule(), '2026-10-03')).toBe(false); // samedi
    expect(occursOn(schedule({ recurrence: 'daily' }), '2026-10-03')).toBe(true);
    expect(occursOn(schedule({ recurrence: 'weekly', weekdays: [1, 3] }), '2026-09-30')).toBe(true); // mercredi
    expect(occursOn(schedule({ recurrence: 'weekly', weekdays: [1, 3] }), '2026-09-29')).toBe(false);
    expect(occursOn(schedule({ recurrence: 'once', startDate: '2026-09-29' }), '2026-09-30')).toBe(false);
    expect(occursOn(schedule({ endDate: '2026-09-28' }), '2026-09-29')).toBe(false);
    expect(occursOn(schedule({ status: 'cancelled' }), '2026-09-29')).toBe(false);
  });

  it('exclut les occurrences annulées et rattache l’exécution', () => {
    const src = { schedules: [schedule({ skippedDates: ['2026-09-30'] })], routines: [template], runs: [run({})] };
    const list = occurrencesBetween(src, '2026-09-29', '2026-10-01');
    expect(list.map((o) => o.date)).toEqual(['2026-09-29', '2026-10-01']);
    expect(list[0]!.run?.id).toBe('r');
  });

  it('affectation directe ou via l’équipe', () => {
    expect(isAssignedTo(schedule(), { id: 'u1' })).toBe(true);
    expect(isAssignedTo(schedule({ assigneeId: undefined, teamId: 'ta' }), { id: 'u2', teamId: 'ta' })).toBe(true);
    expect(isAssignedTo(schedule({ assigneeId: undefined, teamId: 'ta' }), { id: 'u2', teamId: 'tb' })).toBe(false);
  });

  it('à venir → à faire → en retard → en cours → terminée ; non réalisée les jours passés', () => {
    const o = (r?: RoutineRun, date = '2026-09-29') => ({ date, time: '08:00', run: r });
    expect(occurrenceState(o(), '2026-09-29', at(7, 59), 120)).toBe('upcoming');
    expect(occurrenceState(o(), '2026-09-29', at(9, 0), 120)).toBe('due');
    expect(occurrenceState(o(), '2026-09-29', at(10, 1), 120)).toBe('late');
    expect(occurrenceState(o(run({})), '2026-09-29', at(10, 1), 120)).toBe('in_progress');
    expect(occurrenceState(o(run({}, { completedAt: '2026-09-29T06:30:00.000Z' })), '2026-09-29', at(23), 120)).toBe('done');
    expect(occurrenceState(o(undefined, '2026-09-28'), '2026-09-29', at(7), 120)).toBe('missed');
  });

  it('compte les occurrences par état', () => {
    const src = {
      schedules: [schedule({ recurrence: 'daily' })],
      routines: [template],
      runs: [run({}, { completedAt: '2026-09-29T06:30:00.000Z' })],
    };
    const counts = countOccurrences(occurrencesBetween(src, '2026-09-27', '2026-09-30'), '2026-09-29', at(12), 120);
    expect(counts).toMatchObject({ planned: 4, done: 1, missed: 2, upcoming: 1 });
  });
});

describe('exécution des routines', () => {
  const ok = { status: 'ok' as const, at: base.createdAt, by: 'u1' };

  it('évalue les contrôles typés', () => {
    const num = { id: 'n', label: 'N', type: 'number' as const, required: true, min: 1.42, max: 1.52 };
    expect(evaluateCheck(num, 1.47)).toBe('ok');
    expect(evaluateCheck(num, 1.6)).toBe('ko');
    expect(evaluateCheck({ ...num, type: 'yes_no' }, false)).toBe('ko');
    expect(evaluateCheck({ ...num, type: 'text' }, 'Indice C')).toBe('ok');
  });

  it('une tâche avec checklist jointe inclut ses contrôles ; faite quand les obligatoires sont renseignés', () => {
    const tools = template.tasks[1]!;
    const checks = taskChecks(tools, checklists);
    expect(checks.map((c) => c.id)).toEqual(['gants', 'h']);
    expect(taskProgress(tools, checks, run({ [checkKey('outils', 'gants')]: ok })).state).toBe('partial');
    expect(
      taskProgress(tools, checks, run({ [checkKey('outils', 'gants')]: ok, [checkKey('outils', 'h')]: { ...ok, value: 1.5 } })).state,
    ).toBe('done');
  });

  it('la routine se termine quand toutes les tâches obligatoires sont faites (les facultatives peuvent manquer)', () => {
    const partial = run({ simple: ok });
    expect(runSummary(template, checklists, partial)).toMatchObject({
      tasks: 3,
      tasksDone: 1,
      required: 2,
      requiredDone: 1,
      canComplete: false,
    });
    const complete = run(
      { simple: ok, [checkKey('outils', 'gants')]: ok, [checkKey('outils', 'h')]: { ...ok, status: 'ko', value: 1.6 } },
      { completedAt: '2026-09-29T06:23:00.000Z' },
    );
    expect(runSummary(template, checklists, complete)).toMatchObject({ requiredDone: 2, canComplete: true, ko: 1, durationMin: 18 });
  });

  it('terminée à l’heure : dans l’heure prévue + durée + tolérance, le jour même', () => {
    const occ = { date: '2026-09-29', time: '08:00', routine: template };
    expect(completedOnTime({ ...occ, run: run({}, { completedAt: new Date(2026, 8, 29, 10, 20).toISOString() }) }, 120)).toBe(true);
    expect(completedOnTime({ ...occ, run: run({}, { completedAt: new Date(2026, 8, 29, 10, 21).toISOString() }) }, 120)).toBe(false);
    expect(completedOnTime({ ...occ, run: run({}, { completedAt: new Date(2026, 8, 30, 8, 0).toISOString() }) }, 120)).toBe(false);
  });
});

describe('séquences guidées', () => {
  const tpl = {
    ...base,
    id: 's',
    name: 'S',
    active: true,
    steps: [
      { id: 'a', title: 'A', durationMin: 2, active: true },
      { id: 'off', title: 'Désactivée', durationMin: 9, active: false },
      { id: 'b', title: 'B', durationMin: 3, active: true },
    ],
  };
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

  it('les étapes désactivées sont ignorées à l’exécution', () => {
    const r = startRun(tpl, 'u1', t(0));
    expect(r.steps.map((x) => x.stepId)).toEqual(['a', 'b']);
    expect(runSteps(tpl, r).map((x) => x.title)).toEqual(['A', 'B']);
  });

  it('abandon : état final, plus de transition possible', () => {
    const r = abortRun(startRun(tpl, 'u1', t(0)), t(5));
    expect(r.status).toBe('aborted');
    expect(nextStep(r, t(6))).toBe(r);
  });
});

const alert = (p: Partial<AndonAlert>): AndonAlert => ({
  ...base,
  id: p.id ?? 'x',
  workstationId: 'w1',
  type: 'quality',
  urgency: 'medium',
  detail: 'd',
  status: 'active',
  raisedBy: 'u',
  raisedAt: '2026-09-29T08:00:00.000Z',
  ...p,
});

describe('andon', () => {
  const now = new Date('2026-09-29T08:12:00.000Z');
  it('escalade après le seuil sans prise en charge', () => {
    expect(isEscalated(alert({}), now, 10)).toBe(true);
    expect(isEscalated(alert({}), now, 15)).toBe(false);
    expect(isEscalated(alert({ status: 'acknowledged' }), now, 10)).toBe(false);
  });

  it('retient l’alerte la plus grave d’un poste', () => {
    const list = [
      alert({ id: 'ack', status: 'acknowledged' }),
      alert({ id: 'wait' }),
      alert({ id: 'crit', urgency: 'critical', status: 'acknowledged' }),
    ];
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
    expect(validationErrors({ zone: 'Z', checklist: [{ id: '1', label: 'x', result: 'ko', comment: 'vu' }], observations: [] })).toEqual(
      [],
    );
  });
});

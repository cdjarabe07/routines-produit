import { describe, expect, it } from 'vitest';
import type { ChecklistItem, RoutineRun, RoutineTemplate } from '@/types/domain';
import { buildSample, checkKey, rotateSample, runSummary, taskChecks } from './model';

const items: ChecklistItem[] = Array.from({ length: 8 }, (_, i) => ({
  id: `q${i + 1}`,
  label: `Question ${i + 1}`,
  type: 'yes_no',
  required: true,
}));
const base = { createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z' };
const routine: RoutineTemplate = {
  ...base,
  id: 'lpa',
  title: 'Audit par couches',
  durationMin: 10,
  defaultTime: '10:30',
  active: true,
  tasks: [
    { id: 'audit', title: 'Questions', priority: 'high', required: true, checks: items, sampleSize: 3 },
    { id: 'fixe', title: 'Toujours posée', priority: 'medium', required: true, checks: [items[0]!] },
  ],
};

describe('questions tournantes', () => {
  it('tourne de N en N et finit par poser chaque question', () => {
    expect(rotateSample(items, 3, 0)).toEqual(['q1', 'q2', 'q3']);
    expect(rotateSample(items, 3, 1)).toEqual(['q4', 'q5', 'q6']);
    expect(rotateSample(items, 3, 2)).toEqual(['q7', 'q8', 'q1']);
    const asked = new Set([0, 1, 2].flatMap((r) => rotateSample(items, 3, r)));
    expect(asked.size).toBe(8);
    expect(rotateSample(items, 0, 5)).toHaveLength(8);
    expect(rotateSample(items, 20, 5)).toHaveLength(8);
  });

  it('échantillon par tâche concernée ; aucun sans question tournante', () => {
    expect(buildSample(routine, new Map(), 1)).toEqual({ audit: ['q4', 'q5', 'q6'] });
    expect(buildSample({ ...routine, tasks: [routine.tasks[1]!] }, new Map(), 1)).toBeUndefined();
  });

  it('seules les questions tirées sont affichées et exigées pour terminer', () => {
    const sample = buildSample(routine, new Map(), 0);
    const run: RoutineRun = {
      ...base,
      id: 'r',
      scheduleId: 'sc',
      templateId: 'lpa',
      date: '2026-09-29',
      assigneeId: 'u1',
      startedAt: '2026-09-29T08:30:00.000Z',
      sample,
      results: {},
    };
    expect(taskChecks(routine.tasks[0]!, new Map(), run).map((c) => c.id)).toEqual(['q1', 'q2', 'q3']);
    expect(taskChecks(routine.tasks[0]!, new Map()).length).toBe(8);
    const answered = (ids: string[], extra: Record<string, never> = {}) => ({
      ...run,
      results: {
        ...Object.fromEntries(ids.map((id) => [checkKey('audit', id), { status: 'ok' as const, value: true, at: '', by: 'u1' }])),
        [checkKey('fixe', 'q1')]: { status: 'ok' as const, value: true, at: '', by: 'u1' },
        ...extra,
      },
    });
    expect(runSummary(routine, new Map(), answered(['q1', 'q2'])).canComplete).toBe(false);
    expect(runSummary(routine, new Map(), answered(['q1', 'q2', 'q3'])).canComplete).toBe(true);
  });
});

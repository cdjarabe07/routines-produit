import { describe, expect, it } from 'vitest';
import { canFail, cleanChecks } from '@/features/checklists/components/ChecklistItemsEditor';
import type { ChecklistItem, ItemResult, RoutineRun, RoutineTask } from '@/types/domain';
import { checkKey, checkMissing, evaluateCheck, isCheckComplete, taskProgress } from './model';

const item = (p: Partial<ChecklistItem>): ChecklistItem => ({ id: 'c1', label: 'Pression', type: 'conformity', required: true, ...p });
const result = (p: Partial<ItemResult>): ItemResult => ({ status: 'ok', at: '2026-10-05T08:00:00Z', by: 'u', ...p });
const task: RoutineTask = { id: 't1', title: 'Contrôle', priority: 'medium', required: true, checks: [] } as unknown as RoutineTask;
const run = (results: Record<string, ItemResult>): RoutineRun => ({ results }) as unknown as RoutineRun;

describe('Checklists enrichies — complétude d’un contrôle', () => {
  it('exige la photo quand elle est obligatoire', () => {
    const c = item({ photo: 'required' });
    expect(checkMissing(c, result({}))).toBe('Photo obligatoire');
    expect(isCheckComplete(c, result({ photoId: 'ph1' }))).toBe(true);
    expect(checkMissing(item({ photo: 'optional' }), result({}))).toBeNull();
  });

  it('exige un commentaire seulement si le contrôle est non conforme', () => {
    const c = item({ commentOnFail: true });
    expect(checkMissing(c, result({ status: 'ok' }))).toBeNull();
    expect(checkMissing(c, result({ status: 'ko' }))).toMatch(/Commentaire/);
    expect(checkMissing(c, result({ status: 'ko', comment: '  ' }))).toMatch(/Commentaire/);
    expect(isCheckComplete(c, result({ status: 'ko', comment: 'Pièce isolée' }))).toBe(true);
  });

  it('un contrôle non saisi n’est pas complet, mais rien ne « manque » encore', () => {
    expect(isCheckComplete(item({}), undefined)).toBe(false);
    expect(checkMissing(item({ photo: 'required' }), undefined)).toBeNull();
  });

  it('une tâche reste partielle tant qu’un contrôle saisi est incomplet', () => {
    const checks = [item({ id: 'a', commentOnFail: true }), item({ id: 'b', required: false, photo: 'required' })];
    const k = (id: string) => checkKey(task.id, id);
    expect(taskProgress(task, checks, run({ [k('a')]: result({ status: 'ko' }) })).state).toBe('partial');
    expect(taskProgress(task, checks, run({ [k('a')]: result({ status: 'ko', comment: 'Isolé' }) })).state).toBe('done');
    // Contrôle facultatif saisi sans sa photo obligatoire : bloque aussi
    expect(taskProgress(task, checks, run({ [k('a')]: result({ status: 'ok' }), [k('b')]: result({ status: 'ok' }) })).state).toBe(
      'partial',
    );
  });

  it('le lot est une information : toujours conforme', () => {
    expect(evaluateCheck(item({ type: 'lot' }), 'L2026-1004')).toBe('ok');
  });
});

describe('Checklists enrichies — édition', () => {
  it('ne garde le commentaire exigé et l’anomalie automatique que pour les contrôles qui peuvent échouer', () => {
    expect(canFail('number')).toBe(true);
    expect(canFail('lot')).toBe(false);
    const [num, lot] = cleanChecks([
      item({ id: 'n', type: 'number', commentOnFail: true, autoAnomaly: 'major', photo: 'optional', min: 1, max: 2 }),
      item({ id: 'l', type: 'lot', commentOnFail: true, autoAnomaly: 'critical', photo: 'required' }),
    ]);
    expect(num).toMatchObject({ commentOnFail: true, autoAnomaly: 'major', photo: 'optional' });
    expect(lot).toMatchObject({ photo: 'required' });
    expect(lot!.commentOnFail).toBeUndefined();
    expect(lot!.autoAnomaly).toBeUndefined();
  });
});

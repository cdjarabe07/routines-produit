import { useOperation } from '@/hooks/useData';
import type { DataSource, NewEntity } from '@/services/data/types';
import type { CheckResult, DateKey, ID, ItemResult, RoutineRun, RoutineTemplate } from '@/types/domain';
import { findRun, templateItems } from './model';

/** Retourne l'exécution du jour, en la créant si nécessaire. */
async function ensureRun(ds: DataSource, templateId: ID, date: DateKey, userId: ID): Promise<RoutineRun> {
  const existing = findRun(await ds.repo('routineRuns').list({ where: { templateId, date } }), templateId, date);
  if (existing) return existing;
  return ds.repo('routineRuns').create({ templateId, date, assigneeId: userId, results: {} });
}

function withCompletion(template: RoutineTemplate, results: Record<ID, ItemResult>): Pick<RoutineRun, 'results' | 'completedAt'> {
  const items = templateItems(template);
  const complete = items.length > 0 && items.every((i) => results[i.id]);
  return {
    results,
    completedAt: complete ? Object.values(results).map((r) => r.at).sort().at(-1) : undefined,
  };
}

export interface RecordItemInput {
  template: RoutineTemplate;
  date: DateKey;
  itemId: ID;
  /** null = annuler la saisie du point */
  status: CheckResult | null;
  comment?: string;
  anomalyId?: ID;
  userId: ID;
}

export async function recordItem(ds: DataSource, input: RecordItemInput): Promise<RoutineRun> {
  const run = await ensureRun(ds, input.template.id, input.date, input.userId);
  const results = { ...run.results };
  if (input.status === null) {
    delete results[input.itemId];
  } else {
    const previous = results[input.itemId];
    results[input.itemId] = {
      status: input.status,
      comment: input.comment?.trim() || undefined,
      at: new Date().toISOString(),
      by: input.userId,
      anomalyId: input.anomalyId ?? (input.status === 'ko' ? previous?.anomalyId : undefined),
    };
  }
  return ds.repo('routineRuns').update(run.id, withCompletion(input.template, results));
}

export function useRecordItem() {
  return useOperation((ds, input: RecordItemInput) => recordItem(ds, input), { invalidates: ['routineRuns'] });
}

/* ---------- Modèles ---------- */

export type RoutineTemplateInput = NewEntity<RoutineTemplate>;

export function useSaveRoutineTemplate() {
  return useOperation(
    (ds, { id, input }: { id?: ID; input: RoutineTemplateInput }) =>
      id ? ds.repo('routineTemplates').update(id, input) : ds.repo('routineTemplates').create(input),
    { invalidates: ['routineTemplates'], success: 'Modèle de routine enregistré.' },
  );
}

export function useSetTemplateActive() {
  return useOperation((ds, { id, active }: { id: ID; active: boolean }) => ds.repo('routineTemplates').update(id, { active }), {
    invalidates: ['routineTemplates'],
    success: (t) => (t.active ? 'Modèle réactivé.' : 'Modèle archivé : il ne sera plus planifié.'),
  });
}

import { resolveCatalog } from '@/app/catalog';
import { DEFAULT_SETTINGS } from '@/features/shared/api';
import { SECTOR_TEMPLATES, type SectorKey } from '@/data/sectors';
import { useOperation } from '@/hooks/useData';
import type { DataSource } from '@/services/data/types';
import type { ID, RoutineTask } from '@/types/domain';
import { createId } from '@/utils/id';

export interface AppliedTemplate {
  checklists: number;
  routines: number;
}

/**
 * Applique un modèle de secteur à l'entreprise :
 * - référentiels (étapes, catégories, motifs d'Andon, vocabulaire, postes) et modules masqués ;
 * - checklists et routines types, sans doublon (une checklist ou une routine du même nom est conservée telle quelle).
 * Rien n'est planifié : les routines sont prêtes à être affectées.
 */
export async function applySectorTemplate(ds: DataSource, key: SectorKey): Promise<AppliedTemplate> {
  const template = SECTOR_TEMPLATES[key];
  const catalog = resolveCatalog(template.catalog);
  const settings = (await ds.repo('settings').list())[0];
  const patch = { catalog, sectorTemplate: key, disabledModules: template.disabledModules };
  if (settings) await ds.repo('settings').update(settings.id, patch);
  else await ds.repo('settings').create({ id: 'app', ...DEFAULT_SETTINGS, ...patch });

  const checklistIds = new Map<string, ID>((await ds.repo('checklists').list()).map((c) => [c.name, c.id]));
  let checklists = 0;
  for (const c of template.checklists) {
    if (checklistIds.has(c.name)) continue;
    const created = await ds.repo('checklists').create({ name: c.name, description: c.description, items: c.items, active: true });
    checklistIds.set(c.name, created.id);
    checklists += 1;
  }

  const titles = new Set((await ds.repo('routineTemplates').list()).map((r) => r.title));
  let routines = 0;
  for (const r of template.routines) {
    if (titles.has(r.title)) continue;
    const tasks: RoutineTask[] = r.tasks.map(({ checklist, checks, ...t }) => ({
      ...t,
      id: createId(),
      checks: checks ?? [],
      ...(checklist && checklistIds.has(checklist) ? { checklistId: checklistIds.get(checklist) } : {}),
    }));
    await ds.repo('routineTemplates').create({
      title: r.title,
      description: `${r.description} Fréquence conseillée : ${r.suggestedFrequency.toLowerCase()}.${r.reference ? ` Référence : ${r.reference}.` : ''}`,
      durationMin: r.durationMin,
      defaultTime: r.defaultTime,
      tasks,
      active: true,
    });
    routines += 1;
  }
  return { checklists, routines };
}

export function useApplySectorTemplate() {
  return useOperation((ds, key: SectorKey) => applySectorTemplate(ds, key), {
    invalidates: ['settings', 'checklists', 'routineTemplates'],
    success: (r) => `Modèle appliqué : référentiels mis à jour, ${r.checklists} checklist(s) et ${r.routines} routine(s) ajoutée(s).`,
  });
}

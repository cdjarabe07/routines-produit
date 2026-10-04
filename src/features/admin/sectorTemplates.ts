import { resolveCatalog } from '@/app/catalog';
import { DEFAULT_SETTINGS } from '@/features/shared/api';
import { EXAMPLE_PREFIX, SECTOR_TEMPLATES, type SectorKey, type SectorRoutine } from '@/data/sectors';
import { useOperation } from '@/hooks/useData';
import type { DataSource } from '@/services/data/types';
import type { ChecklistItem, ID, RoutineTask } from '@/types/domain';
import { createId } from '@/utils/id';

export interface AppliedTemplate {
  checklists: number;
  routines: number;
}

/** Bornes d'une mesure adaptées par l'entreprise avant application */
export interface ValueOverride {
  min?: number;
  max?: number;
  unit?: string;
}

/** Options de personnalisation choisies à l'application du modèle (par défaut : tout) */
export interface ApplyOptions {
  /** Titres des routines à créer ; absent = toutes */
  routines?: string[];
  /** Noms des checklists à créer ; absent = toutes (celles utilisées par une routine retenue sont toujours créées) */
  checklists?: string[];
  /** Bornes adaptées, par routine et par contrôle (clé : overrideKey) */
  overrides?: Record<string, ValueOverride>;
  /** Remplacer les référentiels (étapes, catégories, motifs d'Andon, noms des rôles) ; vrai par défaut */
  replaceCatalog?: boolean;
  /** Masquer les modules que le secteur n'utilise pas d'habitude ; vrai par défaut */
  applyModules?: boolean;
}

export const overrideKey = (routineTitle: string, checkId: string) => `${routineTitle}::${checkId}`;

/** Mesures d'une routine dont les bornes peuvent être adaptées (valeurs d'exemple en premier) */
export function adjustableChecks(r: SectorRoutine): ChecklistItem[] {
  return r.tasks
    .flatMap((t) => t.checks ?? [])
    .filter((c) => c.type === 'number')
    .sort((a, b) => Number(Boolean(b.help?.startsWith(EXAMPLE_PREFIX))) - Number(Boolean(a.help?.startsWith(EXAMPLE_PREFIX))));
}

/** Contrôle avec les bornes adaptées : il n'est plus une valeur d'exemple, l'aide d'origine reste comme repère */
function withOverride(item: ChecklistItem, o?: ValueOverride): ChecklistItem {
  if (!o || item.type !== 'number') return item;
  return {
    ...item,
    min: o.min ?? item.min,
    max: o.max ?? item.max,
    unit: o.unit?.trim() || item.unit,
    help: item.help?.startsWith(EXAMPLE_PREFIX) ? `Repère du modèle : ${item.help.slice(EXAMPLE_PREFIX.length)}` : item.help,
  };
}

/**
 * Applique un modèle de secteur à l'entreprise, selon les options choisies :
 * - référentiels (étapes, catégories, motifs d'Andon, vocabulaire) et modules masqués ;
 * - checklists et routines types retenues, avec les bornes adaptées, sans doublon
 *   (une checklist ou une routine du même nom est conservée telle quelle).
 * Rien n'est planifié : les routines sont prêtes à être affectées.
 */
export async function applySectorTemplate(ds: DataSource, key: SectorKey, options: ApplyOptions = {}): Promise<AppliedTemplate> {
  const template = SECTOR_TEMPLATES[key];
  const { replaceCatalog = true, applyModules = true, overrides = {} } = options;
  const routinesToCreate = template.routines.filter((r) => !options.routines || options.routines.includes(r.title));
  const neededChecklists = new Set(routinesToCreate.flatMap((r) => r.tasks.map((t) => t.checklist).filter((n): n is string => Boolean(n))));
  const checklistsToCreate = template.checklists.filter(
    (c) => !options.checklists || options.checklists.includes(c.name) || neededChecklists.has(c.name),
  );

  const settings = (await ds.repo('settings').list())[0];
  const patch = {
    sectorTemplate: key,
    ...(replaceCatalog ? { catalog: resolveCatalog(template.catalog) } : {}),
    ...(applyModules ? { disabledModules: template.disabledModules } : {}),
  };
  if (settings) await ds.repo('settings').update(settings.id, patch);
  else await ds.repo('settings').create({ id: 'app', ...DEFAULT_SETTINGS, ...patch });

  const checklistIds = new Map<string, ID>((await ds.repo('checklists').list()).map((c) => [c.name, c.id]));
  let checklists = 0;
  for (const c of checklistsToCreate) {
    if (checklistIds.has(c.name)) continue;
    const created = await ds.repo('checklists').create({ name: c.name, description: c.description, items: c.items, active: true });
    checklistIds.set(c.name, created.id);
    checklists += 1;
  }

  const titles = new Set((await ds.repo('routineTemplates').list()).map((r) => r.title));
  let routines = 0;
  for (const r of routinesToCreate) {
    if (titles.has(r.title)) continue;
    const tasks: RoutineTask[] = r.tasks.map(({ checklist, checks, ...t }) => ({
      ...t,
      id: createId(),
      checks: (checks ?? []).map((c) => withOverride(c, overrides[overrideKey(r.title, c.id)])),
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
  return useOperation((ds, { key, options }: { key: SectorKey; options?: ApplyOptions }) => applySectorTemplate(ds, key, options), {
    invalidates: ['settings', 'checklists', 'routineTemplates'],
    success: (r) =>
      r.checklists + r.routines === 0
        ? 'Modèle appliqué. Les routines et checklists retenues existaient déjà : rien n’a été dupliqué.'
        : `Modèle appliqué : ${r.checklists} checklist(s) et ${r.routines} routine(s) ajoutée(s).`,
  });
}

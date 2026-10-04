import { helpFor } from '@/app/help';
import { MODULE_KEYS, MODULES, moduleOfPath, type ModuleKey } from '@/app/modules';
import { SECTIONS, SPACES, spaceOfPath } from '@/app/navigation';
import type { UsageRow } from '@/services/data/types';

/* Analyse de la fréquentation : quels écrans et quels modules servent réellement. */

export interface ScreenUsage {
  route: string;
  label: string;
  module: ModuleKey | null;
  views: number;
  byRole: Record<string, number>;
  lastDay: string;
}

/** Nom lisible d'un écran (titre de sa rubrique d'aide) */
export const screenLabel = (route: string) => (route === '/introuvable' ? 'Page introuvable' : helpFor(route).title);

/** Vues par écran, du plus consulté au moins consulté */
export function usageByScreen(rows: UsageRow[]): ScreenUsage[] {
  const byRoute = new Map<string, ScreenUsage>();
  for (const r of rows) {
    const s = byRoute.get(r.route) ?? {
      route: r.route,
      label: screenLabel(r.route),
      module: moduleOfPath(r.route),
      views: 0,
      byRole: {},
      lastDay: r.day,
    };
    s.views += r.views;
    s.byRole[r.role] = (s.byRole[r.role] ?? 0) + r.views;
    if (r.day > s.lastDay) s.lastDay = r.day;
    byRoute.set(r.route, s);
  }
  return [...byRoute.values()].sort((a, b) => b.views - a.views || a.label.localeCompare(b.label, 'fr'));
}

/** Vues par module activable (tous les modules, y compris ceux à zéro) */
export function usageByModule(rows: UsageRow[]): { module: ModuleKey; label: string; views: number }[] {
  const views = new Map<ModuleKey, number>(MODULE_KEYS.map((k) => [k, 0]));
  for (const r of rows) {
    const key = moduleOfPath(r.route);
    if (key) views.set(key, views.get(key)! + r.views);
  }
  return MODULE_KEYS.map((module) => ({ module, label: MODULES[module].label, views: views.get(module)! }));
}

export interface MenuScreen {
  path: string;
  label: string;
  /** Espace de l’écran (vide pour les écrans communs) : distingue deux écrans de même nom */
  space: string;
}

/** Écrans du menu (entrées et onglets de section) */
export function menuScreens(): MenuScreen[] {
  const out = new Map<string, string>();
  for (const space of SPACES) for (const group of space.groups) for (const item of group.items) out.set(item.path, item.label);
  for (const tabs of SECTIONS) for (const tab of tabs) if (!out.has(tab.path)) out.set(tab.path, tab.label);
  return [...out].map(([path, label]) => {
    const id = spaceOfPath(path);
    return { path, label, space: id ? (SPACES.find((s) => s.id === id)?.label ?? '') : '' };
  });
}

/** Écrans du menu jamais ouverts sur la période */
export function unusedScreens(rows: UsageRow[], screens = menuScreens()): MenuScreen[] {
  const seen = new Set(rows.filter((r) => r.views > 0).map((r) => r.route));
  return screens.filter((s) => !seen.has(s.path));
}

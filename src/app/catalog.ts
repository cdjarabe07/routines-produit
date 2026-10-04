import { ANDON_PRESETS } from '@/features/andon/model';
import { ANOMALY_CATEGORY, PRODUCTION_STAGE, PRODUCTION_STAGES, SHIFT, SHIFT_SHORT } from '@/features/shared/labels';
import { ROLE_LABELS } from '@/services/auth/permissions';
import type { AndonType, Catalog, CatalogEntry, Role, Shift } from '@/types/domain';

/* Référentiels du site : chaque entreprise adapte la terminologie et les listes de choix à son secteur
   (Paramètres › Référentiels). Les valeurs ci-dessous servent par défaut, pour toute industrie manufacturière.
   Le catalogue est appliqué aux listes partagées (labels.ts, permissions.ts, andon/model.ts) avant l'affichage
   des écrans : aucun écran n'a besoin de le lire lui-même. */

export const DEFAULT_CATALOG: Catalog = {
  productionStages: [
    { key: 'preparation', label: 'Préparation' },
    { key: 'fabrication', label: 'Fabrication' },
    { key: 'assembly', label: 'Assemblage' },
    { key: 'inspection', label: 'Contrôle' },
    { key: 'packaging', label: 'Conditionnement' },
    { key: 'shipping', label: 'Expédition' },
  ],
  anomalyCategories: [
    { key: 'safety', label: 'Sécurité' },
    { key: 'quality', label: 'Qualité' },
    { key: '5s', label: '5S' },
    { key: 'standard', label: 'Standard' },
    { key: 'performance', label: 'Performance' },
    { key: 'equipment', label: 'Équipement' },
    { key: 'material', label: 'Matière' },
    { key: 'other', label: 'Autre' },
  ],
  andonPresets: {
    quality: ['Pièce non conforme', 'Cote hors tolérance', 'Défaut d’aspect', 'Doute sur un contrôle'],
    equipment: ['Machine à l’arrêt', 'Outil usé ou cassé', 'Moyen de contrôle en panne', 'Bruit anormal'],
    material: ['Rupture de composant', 'Matière manquante', 'Consommable épuisé', 'Mauvaise référence livrée'],
    safety: ['Situation dangereuse', 'Blessure légère', 'Protection machine absente'],
  },
  roleLabels: {
    operator: 'Opérateur',
    hancho: 'Chef d’équipe',
    line_leader: 'Responsable de ligne',
    quality: 'Qualité',
    manager: 'Manager',
    admin: 'Administrateur',
  },
  shifts: {
    morning: { label: 'Équipe du matin', short: 'Matin', active: true },
    afternoon: { label: 'Équipe d’après-midi', short: 'Après-midi', active: true },
    night: { label: 'Équipe de nuit', short: 'Nuit', active: true },
  },
};

export const ANDON_TYPES: AndonType[] = ['quality', 'equipment', 'material', 'safety'];
export const ROLES: Role[] = ['operator', 'hancho', 'line_leader', 'quality', 'manager', 'admin'];
export const SHIFTS: Shift[] = ['morning', 'afternoon', 'night'];

const MAX_LABEL = 60;
const MAX_ENTRIES = 40;

/** Clé technique dérivée d'un libellé (« Contrôle final » → « controle-final ») */
export function keyFromLabel(label: string, taken: Iterable<string> = []): string {
  const base =
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || 'element';
  const used = new Set(taken);
  let key = base;
  for (let i = 2; used.has(key); i++) key = `${base}-${i}`;
  return key;
}

function cleanEntries(entries: unknown, fallback: CatalogEntry[]): CatalogEntry[] {
  if (!Array.isArray(entries)) return fallback;
  const seen = new Set<string>();
  const out: CatalogEntry[] = [];
  for (const e of entries.slice(0, MAX_ENTRIES)) {
    if (!e || typeof e !== 'object') continue;
    const { key, label } = e as Partial<CatalogEntry>;
    if (typeof key !== 'string' || typeof label !== 'string' || !key.trim() || !label.trim() || seen.has(key)) continue;
    seen.add(key);
    out.push({ key: key.trim().slice(0, 40), label: label.trim().slice(0, MAX_LABEL) });
  }
  return out.length ? out : fallback;
}

/** Catalogue complet : valeurs du site, complétées et contrôlées par les valeurs par défaut */
export function resolveCatalog(partial?: Partial<Catalog> | null): Catalog {
  const c = partial ?? {};
  const presets = { ...DEFAULT_CATALOG.andonPresets };
  for (const type of ANDON_TYPES) {
    const list = c.andonPresets?.[type];
    if (Array.isArray(list))
      presets[type] = list
        .filter((m): m is string => typeof m === 'string' && m.trim() !== '')
        .map((m) => m.trim().slice(0, 80))
        .slice(0, 12);
  }
  const roleLabels = { ...DEFAULT_CATALOG.roleLabels };
  for (const role of ROLES) {
    const label = c.roleLabels?.[role];
    if (typeof label === 'string' && label.trim()) roleLabels[role] = label.trim().slice(0, MAX_LABEL);
  }
  const shifts = structuredClone(DEFAULT_CATALOG.shifts);
  for (const shift of SHIFTS) {
    const s = c.shifts?.[shift];
    if (!s) continue;
    if (typeof s.label === 'string' && s.label.trim()) shifts[shift].label = s.label.trim().slice(0, MAX_LABEL);
    if (typeof s.short === 'string' && s.short.trim()) shifts[shift].short = s.short.trim().slice(0, 20);
    if (typeof s.active === 'boolean') shifts[shift].active = s.active;
  }
  // Au moins un poste horaire reste utilisable
  if (!SHIFTS.some((s) => shifts[s].active)) shifts.morning.active = true;
  return {
    productionStages: cleanEntries(c.productionStages, DEFAULT_CATALOG.productionStages),
    anomalyCategories: cleanEntries(c.anomalyCategories, DEFAULT_CATALOG.anomalyCategories),
    andonPresets: presets,
    roleLabels,
    shifts,
  };
}

function replaceRecord(target: Record<string, string>, entries: CatalogEntry[]) {
  for (const k of Object.keys(target)) delete target[k];
  for (const e of entries) target[e.key] = e.label;
}

/** Applique le catalogue aux listes partagées. Idempotent ; à appeler avant l'affichage des écrans. */
export function applyCatalog(catalog: Catalog): void {
  replaceRecord(PRODUCTION_STAGE, catalog.productionStages);
  PRODUCTION_STAGES.splice(0, PRODUCTION_STAGES.length, ...catalog.productionStages.map((e) => e.key));
  replaceRecord(ANOMALY_CATEGORY, catalog.anomalyCategories);
  for (const type of ANDON_TYPES) ANDON_PRESETS[type] = [...catalog.andonPresets[type]];
  Object.assign(ROLE_LABELS, catalog.roleLabels);
  for (const shift of SHIFTS) {
    SHIFT[shift] = catalog.shifts[shift].label;
    SHIFT_SHORT[shift] = catalog.shifts[shift].short;
  }
  activeShifts.splice(0, activeShifts.length, ...SHIFTS.filter((s) => catalog.shifts[s].active));
}

/** Postes horaires utilisés sur le site (listes de choix) ; les données existantes gardent leur libellé */
export const activeShifts: Shift[] = [...SHIFTS];

/** Libellés sûrs : une clé retirée du catalogue reste lisible */
export const stageLabel = (key: string) => PRODUCTION_STAGE[key] ?? key;
export const anomalyCategoryLabel = (key: string) => ANOMALY_CATEGORY[key] ?? key;

/** Choix de poste horaire : postes utilisés sur le site, plus la valeur actuelle si elle ne l'est plus */
export function shiftOptions(style: 'long' | 'short', current?: Shift | null): { value: Shift; label: string }[] {
  const labels = style === 'long' ? SHIFT : SHIFT_SHORT;
  return SHIFTS.filter((s) => activeShifts.includes(s) || s === current).map((s) => ({ value: s, label: labels[s] }));
}

/** Catégorie proposée automatiquement (ex. « qualité » pour un contrôle hors tolérance), si le site l'utilise ;
    sinon la première catégorie du site */
export const categoryOr = (preferred: string) =>
  ANOMALY_CATEGORY[preferred] !== undefined ? preferred : (Object.keys(ANOMALY_CATEGORY)[0] ?? preferred);

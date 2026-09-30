import type { ErpObjectMap, ErpObjectType } from './types.ts';

/* Validation des données reçues de l'ERP. Tout ce qui vient de l'extérieur est traité comme non fiable :
   un enregistrement invalide est rejeté individuellement (il n'empêche pas les autres d'être enregistrés). */

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string; externalId?: string };

type Rec = Record<string, unknown>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

class Invalid extends Error {}

function field(r: Rec, name: string) {
  const v = r[name];
  return {
    str(max = 200): string {
      if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Invalid(`${name} manquant ou invalide`);
      return v.trim();
    },
    optStr(max = 2000): string | undefined {
      if (v === undefined || v === null || v === '') return undefined;
      if (typeof v !== 'string' || v.length > max) throw new Invalid(`${name} invalide`);
      return v.trim();
    },
    num({ min = -1e9, max = 1e9, nonZero = false } = {}): number {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (nonZero && v === 0))
        throw new Invalid(`${name} n’est pas un nombre valide`);
      return v;
    },
    oneOf<T extends string>(values: readonly T[]): T {
      if (typeof v !== 'string' || !values.includes(v as T)) throw new Invalid(`${name} a une valeur inconnue`);
      return v as T;
    },
    date(): string {
      if (typeof v !== 'string' || !DATE.test(v) || Number.isNaN(Date.parse(v))) throw new Invalid(`${name} n’est pas une date`);
      return v;
    },
    dateTime(): string {
      if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw new Invalid(`${name} n’est pas un horodatage`);
      return new Date(v).toISOString();
    },
  };
}

const VALIDATORS: { [K in ErpObjectType]: (r: Rec) => ErpObjectMap[K] } = {
  workCenter: (r) => ({
    externalId: field(r, 'externalId').str(120),
    code: field(r, 'code').str(40),
    name: field(r, 'name').str(120),
    description: field(r, 'description').optStr(400),
  }),
  material: (r) => ({
    externalId: field(r, 'externalId').str(120),
    materialNumber: field(r, 'materialNumber').str(40),
    description: field(r, 'description').str(200),
    type: field(r, 'type').oneOf(['finished_harness', 'wire', 'terminal', 'connector', 'sleeve', 'tape', 'other'] as const),
    baseUnit: field(r, 'baseUnit').str(10),
  }),
  productionOrder: (r) => {
    const order = {
      externalId: field(r, 'externalId').str(120),
      orderNumber: field(r, 'orderNumber').str(40),
      materialNumber: field(r, 'materialNumber').str(40),
      description: field(r, 'description').str(200),
      plannedQuantity: field(r, 'plannedQuantity').num({ min: 0 }),
      confirmedQuantity: field(r, 'confirmedQuantity').num({ min: 0 }),
      unit: field(r, 'unit').str(10),
      workCenterCode: field(r, 'workCenterCode').optStr(40),
      status: field(r, 'status').oneOf(['planned', 'released', 'in_progress', 'completed', 'closed'] as const),
      plannedStart: field(r, 'plannedStart').date(),
      plannedEnd: field(r, 'plannedEnd').date(),
      updatedAt: field(r, 'updatedAt').dateTime(),
    };
    if (order.plannedEnd < order.plannedStart) throw new Invalid('plannedEnd antérieure à plannedStart');
    return order;
  },
  stock: (r) => ({
    externalId: field(r, 'externalId').str(120),
    materialNumber: field(r, 'materialNumber').str(40),
    location: field(r, 'location').str(40),
    quantity: field(r, 'quantity').num({ min: 0 }),
    unit: field(r, 'unit').str(10),
    updatedAt: field(r, 'updatedAt').dateTime(),
  }),
  stockMovement: (r) => ({
    externalId: field(r, 'externalId').str(120),
    materialNumber: field(r, 'materialNumber').str(40),
    location: field(r, 'location').str(40),
    quantity: field(r, 'quantity').num({ nonZero: true }),
    unit: field(r, 'unit').str(10),
    movementType: field(r, 'movementType').oneOf(['goods_issue', 'goods_receipt', 'transfer'] as const),
    postedAt: field(r, 'postedAt').dateTime(),
    orderNumber: field(r, 'orderNumber').optStr(40),
  }),
  qualityNotification: (r) => ({
    externalId: field(r, 'externalId').str(120),
    number: field(r, 'number').str(40),
    title: field(r, 'title').str(200),
    description: field(r, 'description').optStr(2000),
    materialNumber: field(r, 'materialNumber').optStr(40),
    workCenterCode: field(r, 'workCenterCode').optStr(40),
    priority: field(r, 'priority').oneOf(['low', 'medium', 'high'] as const),
    status: field(r, 'status').oneOf(['open', 'in_progress', 'closed'] as const),
    reportedAt: field(r, 'reportedAt').dateTime(),
  }),
  maintenanceNotification: (r) => ({
    externalId: field(r, 'externalId').str(120),
    number: field(r, 'number').str(40),
    title: field(r, 'title').str(200),
    description: field(r, 'description').optStr(2000),
    equipment: field(r, 'equipment').optStr(80),
    workCenterCode: field(r, 'workCenterCode').optStr(40),
    priority: field(r, 'priority').oneOf(['low', 'medium', 'high'] as const),
    status: field(r, 'status').oneOf(['open', 'in_progress', 'closed'] as const),
    reportedAt: field(r, 'reportedAt').dateTime(),
  }),
};

/** Valide un enregistrement brut ; les champs inconnus sont ignorés (jamais recopiés). */
export function validateRecord<K extends ErpObjectType>(type: K, raw: unknown): Validation<ErpObjectMap[K]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'enregistrement non structuré' };
  const r = raw as Rec;
  const externalId = typeof r.externalId === 'string' ? r.externalId : undefined;
  try {
    const value = VALIDATORS[type](r) as ErpObjectMap[K];
    // Retire les champs facultatifs absents : l'empreinte ne dépend pas de « undefined »
    for (const [k, v] of Object.entries(value)) if (v === undefined) delete (value as unknown as Rec)[k];
    return { ok: true, value };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message, externalId };
    throw error;
  }
}

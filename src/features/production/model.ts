import type { Tone } from '@/components/ui/Badge';
import type { MaterialStock, ProductionOrder, ProductionStage } from '@/types/domain';
import { PRODUCTION_STAGES } from '@/features/shared/labels';

/* Règles kanban reprises du prototype :
   rupture = 0 ; réappro = sous le minimum ; à surveiller = sous la cible ; sain sinon. */
export type StockState = 'out' | 'reorder' | 'watch' | 'healthy';

export const STOCK_STATE: Record<StockState, { label: string; tone: Tone; rank: number }> = {
  out: { label: 'Rupture', tone: 'danger', rank: 0 },
  reorder: { label: 'Réappro à lancer', tone: 'danger', rank: 1 },
  watch: { label: 'À surveiller', tone: 'warning', rank: 2 },
  healthy: { label: 'Sain', tone: 'success', rank: 3 },
};

export function stockState(s: MaterialStock): StockState {
  if (s.quantity <= 0) return 'out';
  if (s.quantity < s.min) return 'reorder';
  if (s.quantity < s.target) return 'watch';
  return 'healthy';
}

export const needsReorder = (s: MaterialStock) => {
  const st = stockState(s);
  return st === 'out' || st === 'reorder';
};

/** Quantité à commander pour revenir à la cible. */
export const reorderQuantity = (s: MaterialStock) => Math.max(0, s.target - s.quantity);

export const orderProgress = (o: ProductionOrder) => (o.quantityPlanned > 0 ? Math.min(1, o.quantityDone / o.quantityPlanned) : 0);

export const nextStage = (stage: ProductionStage): ProductionStage | null =>
  PRODUCTION_STAGES[PRODUCTION_STAGES.indexOf(stage) + 1] ?? null;
export const previousStage = (stage: ProductionStage): ProductionStage | null =>
  PRODUCTION_STAGES[PRODUCTION_STAGES.indexOf(stage) - 1] ?? null;

export const isActiveOrder = (o: ProductionOrder) => o.status !== 'done';

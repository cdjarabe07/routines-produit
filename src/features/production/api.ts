import { useOperation } from '@/hooks/useData';
import { ValidationError } from '@/services/errors';
import type { EntityPatch, NewEntity } from '@/services/data/types';
import type { ID, MaterialStock, ProductionOrder, StockMovementReason } from '@/types/domain';

export function useUpdateOrder() {
  return useOperation(
    (ds, { id, patch }: { id: ID; patch: EntityPatch<ProductionOrder> }) => ds.repo('productionOrders').update(id, patch),
    { invalidates: ['productionOrders'], success: 'Ordre de fabrication mis à jour.' },
  );
}

export function useCreateOrder() {
  return useOperation((ds, input: NewEntity<ProductionOrder>) => ds.repo('productionOrders').create(input), {
    invalidates: ['productionOrders'],
    success: 'Ordre de fabrication créé.',
  });
}

/** Mouvement de stock tracé : la quantité ne passe jamais sous zéro. */
export function useStockMovement() {
  return useOperation(
    async (ds, { stock, delta, reason, userId }: { stock: MaterialStock; delta: number; reason: StockMovementReason; userId: ID }) => {
      if (!Number.isFinite(delta) || delta === 0) throw new ValidationError('Indiquez une quantité différente de zéro.');
      const fresh = await ds.repo('materialStocks').get(stock.id);
      const quantity = fresh.quantity + delta;
      if (quantity < 0) throw new ValidationError(`Stock insuffisant : ${fresh.quantity} ${fresh.unit} disponibles.`);
      await ds.repo('stockMovements').create({ stockId: stock.id, delta, reason, by: userId });
      return ds.repo('materialStocks').update(stock.id, { quantity });
    },
    { invalidates: ['materialStocks', 'stockMovements'], success: (s) => `${s.material} : ${s.quantity} ${s.unit} en stock.` },
  );
}

export function useSaveStock() {
  return useOperation(
    (ds, { id, input }: { id?: ID; input: NewEntity<MaterialStock> }) =>
      id ? ds.repo('materialStocks').update(id, input) : ds.repo('materialStocks').create(input),
    { invalidates: ['materialStocks'], success: 'Référence matière enregistrée.' },
  );
}

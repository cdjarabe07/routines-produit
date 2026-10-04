import { useCurrentUser } from '@/app/providers/AuthProvider';
import { triggerOrderStart } from '@/features/planning/api';
import { useOperation } from '@/hooks/useData';
import { ValidationError } from '@/services/errors';
import type { EntityPatch, NewEntity } from '@/services/data/types';
import type { ID, MaterialStock, ProductionOrder, StockMovementReason } from '@/types/domain';

/** Passage « en cours » d'un OF : déclenche les routines prévues au démarrage (libération de ligne…). */
export function useUpdateOrder() {
  const user = useCurrentUser();
  return useOperation(
    async (ds, { id, patch }: { id: ID; patch: EntityPatch<ProductionOrder> }) => {
      const before = await ds.repo('productionOrders').get(id);
      const order = await ds.repo('productionOrders').update(id, patch);
      if (order.status === 'in_progress' && before.status !== 'in_progress') await triggerOrderStart(ds, order, user.id);
      return order;
    },
    { invalidates: ['productionOrders', 'routineTriggers', 'notifications'], success: 'Ordre de fabrication mis à jour.' },
  );
}

export function useCreateOrder() {
  const user = useCurrentUser();
  return useOperation(
    async (ds, input: NewEntity<ProductionOrder>) => {
      const order = await ds.repo('productionOrders').create(input);
      if (order.status === 'in_progress') await triggerOrderStart(ds, order, user.id);
      return order;
    },
    { invalidates: ['productionOrders', 'routineTriggers', 'notifications'], success: 'Ordre de fabrication créé.' },
  );
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

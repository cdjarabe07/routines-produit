import type {
  ErpMaintenanceNotification,
  ErpMaterial,
  ErpProductionOrder,
  ErpQualityNotification,
  ErpStock,
  ErpStockMovement,
  ErpSystem,
  ErpWorkCenter,
  NotificationRequest,
  NotificationResult,
} from './types.ts';

/* Contrat entre l'application et un système ERP.
   - MockSapAdapter (mockSapAdapter.ts) : simulation, utilisée tant que le vrai SAP n'est pas connu ;
   - adaptateur réel : À ÉCRIRE quand l'environnement SAP sera connu (docs/ERP_INTEGRATION.md §8).
   Les méthodes de lecture renvoient des données NON FIABLES (`unknown[]`) : le moteur de synchronisation
   les valide avant tout enregistrement, quel que soit l'adaptateur. */

export interface ErpAdapter {
  readonly system: ErpSystem;
  /** true pour une simulation : chaque donnée enregistrée est marquée « simulée » */
  readonly simulated: boolean;
  /** Libellé affiché dans l'administration */
  readonly label: string;

  getWorkCenters(): Promise<unknown[]>;
  getMaterials(): Promise<unknown[]>;
  getProductionOrders(): Promise<unknown[]>;
  getMaterialStocks(): Promise<unknown[]>;
  getStockMovements(): Promise<unknown[]>;
  getQualityNotifications(): Promise<unknown[]>;
  getMaintenanceNotifications(): Promise<unknown[]>;

  /** La clé d'idempotence garantit qu'un renvoi ne crée pas deux avis dans l'ERP. */
  createQualityNotification(request: NotificationRequest, idempotencyKey: string): Promise<NotificationResult>;
  createMaintenanceNotification(request: NotificationRequest, idempotencyKey: string): Promise<NotificationResult>;
}

/** Types attendus en retour des lectures (après validation) */
export type ErpReadResult = {
  workCenter: ErpWorkCenter[];
  material: ErpMaterial[];
  productionOrder: ErpProductionOrder[];
  stock: ErpStock[];
  stockMovement: ErpStockMovement[];
  qualityNotification: ErpQualityNotification[];
  maintenanceNotification: ErpMaintenanceNotification[];
};

/** Lecture brute d'un type d'objet par l'adaptateur */
export function readerFor(adapter: ErpAdapter, type: keyof ErpReadResult): () => Promise<unknown[]> {
  switch (type) {
    case 'workCenter':
      return () => adapter.getWorkCenters();
    case 'material':
      return () => adapter.getMaterials();
    case 'productionOrder':
      return () => adapter.getProductionOrders();
    case 'stock':
      return () => adapter.getMaterialStocks();
    case 'stockMovement':
      return () => adapter.getStockMovements();
    case 'qualityNotification':
      return () => adapter.getQualityNotifications();
    case 'maintenanceNotification':
      return () => adapter.getMaintenanceNotifications();
  }
}

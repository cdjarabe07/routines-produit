/* Modèle canonique de l'intégration ERP.
   Neutre vis-à-vis de la technologie SAP (aucune hypothèse de version ni d'interface) : chaque futur connecteur
   traduit les données de SON système vers ces types. Code sans dépendance d'exécution (Deno et Node/Vitest). */

export type ErpSystem = 'SAP';
export type IntegrationMode = 'off' | 'mock' | 'real';

export type ErpObjectType =
  'productionOrder' | 'workCenter' | 'material' | 'stock' | 'stockMovement' | 'qualityNotification' | 'maintenanceNotification';

export const ERP_OBJECT_TYPES: ErpObjectType[] = [
  'workCenter',
  'material',
  'productionOrder',
  'stock',
  'stockMovement',
  'qualityNotification',
  'maintenanceNotification',
];

/** Date ISO (AAAA-MM-JJ) et horodatage ISO 8601 */
export type IsoDate = string;
export type IsoDateTime = string;

export interface ErpWorkCenter {
  externalId: string;
  code: string;
  name: string;
  description?: string;
}

export type ErpMaterialType = 'finished_harness' | 'wire' | 'terminal' | 'connector' | 'sleeve' | 'tape' | 'other';

export interface ErpMaterial {
  externalId: string;
  materialNumber: string;
  description: string;
  type: ErpMaterialType;
  baseUnit: string;
}

export type ErpOrderStatus = 'planned' | 'released' | 'in_progress' | 'completed' | 'closed';

export interface ErpProductionOrder {
  externalId: string;
  orderNumber: string;
  materialNumber: string;
  description: string;
  plannedQuantity: number;
  confirmedQuantity: number;
  unit: string;
  workCenterCode?: string;
  status: ErpOrderStatus;
  plannedStart: IsoDate;
  plannedEnd: IsoDate;
  updatedAt: IsoDateTime;
}

export interface ErpStock {
  externalId: string;
  materialNumber: string;
  location: string;
  quantity: number;
  unit: string;
  updatedAt: IsoDateTime;
}

export type ErpMovementType = 'goods_issue' | 'goods_receipt' | 'transfer';

export interface ErpStockMovement {
  externalId: string;
  materialNumber: string;
  location: string;
  quantity: number;
  unit: string;
  movementType: ErpMovementType;
  postedAt: IsoDateTime;
  orderNumber?: string;
}

export type ErpNotificationStatus = 'open' | 'in_progress' | 'closed';
export type ErpPriority = 'low' | 'medium' | 'high';

export interface ErpQualityNotification {
  externalId: string;
  number: string;
  title: string;
  description?: string;
  materialNumber?: string;
  workCenterCode?: string;
  priority: ErpPriority;
  status: ErpNotificationStatus;
  reportedAt: IsoDateTime;
}

export interface ErpMaintenanceNotification {
  externalId: string;
  number: string;
  title: string;
  description?: string;
  equipment?: string;
  workCenterCode?: string;
  priority: ErpPriority;
  status: ErpNotificationStatus;
  reportedAt: IsoDateTime;
}

export interface ErpObjectMap {
  productionOrder: ErpProductionOrder;
  workCenter: ErpWorkCenter;
  material: ErpMaterial;
  stock: ErpStock;
  stockMovement: ErpStockMovement;
  qualityNotification: ErpQualityNotification;
  maintenanceNotification: ErpMaintenanceNotification;
}

/* ---------- Flux application → ERP ---------- */

export interface NotificationRequest {
  title: string;
  description?: string;
  workCenterCode?: string;
  priority: ErpPriority;
  /** Origine dans l'application (ex. anomalie, Andon) */
  sourceType: string;
  sourceId: string;
}

export interface NotificationResult {
  externalId: string;
  number: string;
}

export type OutboxOperation = 'createQualityNotification' | 'createMaintenanceNotification';

/* ---------- Erreurs typées : le moteur distingue le transitoire (réessayable) du définitif ---------- */

export class ErpError extends Error {
  readonly transient: boolean;
  readonly code: string;
  constructor(code: string, message: string, transient: boolean) {
    super(message);
    this.name = 'ErpError';
    this.code = code;
    this.transient = transient;
  }
}

export class ErpUnavailableError extends ErpError {
  constructor(message = 'Système ERP indisponible') {
    super('unavailable', message, true);
  }
}

export class ErpTimeoutError extends ErpError {
  constructor(message = 'Délai de réponse du système ERP dépassé') {
    super('timeout', message, true);
  }
}

export class ErpInvalidResponseError extends ErpError {
  constructor(message = 'Réponse du système ERP invalide') {
    super('invalid_response', message, false);
  }
}

export class ErpRejectedError extends ErpError {
  constructor(message = 'Demande refusée par le système ERP') {
    super('rejected', message, false);
  }
}

export class ErpNotConfiguredError extends ErpError {
  constructor(message = 'Connecteur ERP réel non configuré') {
    super('not_configured', message, false);
  }
}

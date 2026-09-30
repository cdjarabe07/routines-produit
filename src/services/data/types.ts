import type {
  Action,
  Announcement,
  AndonAlert,
  Anomaly,
  AppNotification,
  AppSettings,
  BaseEntity,
  Checklist,
  Comment,
  Favorite,
  GembaWalk,
  Handover,
  ID,
  ItemResult,
  KnowledgeItem,
  Leave,
  Line,
  MaterialStock,
  Meeting,
  PresenceRecord,
  ProductionOrder,
  QualityCheck,
  RoutineRun,
  RoutineTemplate,
  Schedule,
  SequenceRun,
  SequenceTemplate,
  StockMovement,
  Team,
  User,
  Workstation,
} from '@/types/domain';

/** Toutes les collections persistées. Ajouter une entité = l'ajouter ici. */
export interface CollectionMap {
  users: User;
  teams: Team;
  lines: Line;
  workstations: Workstation;
  presence: PresenceRecord;
  leaves: Leave;
  checklists: Checklist;
  routineTemplates: RoutineTemplate;
  schedules: Schedule;
  routineRuns: RoutineRun;
  actions: Action;
  comments: Comment;
  anomalies: Anomaly;
  andonAlerts: AndonAlert;
  sequenceTemplates: SequenceTemplate;
  sequenceRuns: SequenceRun;
  productionOrders: ProductionOrder;
  materialStocks: MaterialStock;
  stockMovements: StockMovement;
  gembaWalks: GembaWalk;
  qualityChecks: QualityCheck;
  knowledgeItems: KnowledgeItem;
  favorites: Favorite;
  meetings: Meeting;
  handovers: Handover;
  announcements: Announcement;
  notifications: AppNotification;
  settings: AppSettings;
}

export type CollectionName = keyof CollectionMap;

export const COLLECTIONS: CollectionName[] = [
  'users',
  'teams',
  'lines',
  'workstations',
  'presence',
  'leaves',
  'checklists',
  'routineTemplates',
  'schedules',
  'routineRuns',
  'actions',
  'comments',
  'anomalies',
  'andonAlerts',
  'sequenceTemplates',
  'sequenceRuns',
  'productionOrders',
  'materialStocks',
  'stockMovements',
  'gembaWalks',
  'qualityChecks',
  'knowledgeItems',
  'favorites',
  'meetings',
  'handovers',
  'announcements',
  'notifications',
  'settings',
];

export type NewEntity<T extends BaseEntity> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: ID };
export type EntityPatch<T extends BaseEntity> = Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>;

export interface ListFilter<T> {
  /** Égalité stricte sur des champs de premier niveau. Transmis en query string au backend. */
  where?: Partial<T>;
}

export interface Repository<T extends BaseEntity> {
  list(filter?: ListFilter<T>): Promise<T[]>;
  get(id: ID): Promise<T>;
  create(input: NewEntity<T>): Promise<T>;
  update(id: ID, patch: EntityPatch<T>): Promise<T>;
  remove(id: ID): Promise<void>;
}

export type DataMode = 'demo' | 'api' | 'supabase';

export interface DataSource {
  readonly kind: DataMode;
  repo<K extends CollectionName>(name: K): Repository<CollectionMap[K]>;
  /** Recharge le jeu de démonstration. Indisponible en mode API et en production. */
  resetDemoData?: () => Promise<void>;
  /** Notifications et journal d'audit produits par le serveur : le navigateur n'en écrit pas. */
  readonly serverSideEffects?: boolean;
  /** Gestion des comptes d'authentification (création, mot de passe provisoire) : opérations serveur réservées aux administrateurs. */
  accounts?: AccountAdmin;
  /** Saisie atomique d'un résultat de routine (auteur et heure imposés par le serveur). Sinon : relecture puis écriture. */
  recordRunResult?(runId: ID, key: string, result: Omit<ItemResult, 'at' | 'by'> | null): Promise<RoutineRun>;
  /** Journal d'audit tenu par le serveur (lecture seule, administration). */
  auditLog?(limit: number): Promise<AuditEntry[]>;
  /** Intégration ERP : opérations exécutées par le serveur (le navigateur ne connaît aucun système ERP). */
  integration?: IntegrationApi;
}

/* ---------- Intégration ERP (docs/ERP_INTEGRATION.md) ---------- */

export type IntegrationMode = 'off' | 'mock' | 'real';
export type SyncRunStatus = 'running' | 'success' | 'partial' | 'failed';
export type OutboxStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'dead';
export type ErpObjectType =
  'workCenter' | 'material' | 'productionOrder' | 'stock' | 'stockMovement' | 'qualityNotification' | 'maintenanceNotification';

export interface IntegrationStatus {
  mode: IntegrationMode;
  system: string;
  scenarios: { id: string; label: string }[];
}

export interface IntegrationSyncRun {
  id: ID;
  source: string;
  mode: 'mock' | 'real';
  scenario?: string;
  status: SyncRunStatus;
  startedAt: string;
  finishedAt?: string;
  recordsRead: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  recordsFailed: number;
  errorMessage?: string;
  metadata: Record<string, unknown>;
  triggeredBy?: ID;
}

export interface IntegrationOutboxItem {
  id: ID;
  target: string;
  entityType: string;
  entityId: string;
  operation: 'createQualityNotification' | 'createMaintenanceNotification';
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  nextRetryAt: string;
  lastError?: string;
  externalId?: string;
  sentAt?: string;
  simulated: boolean;
  createdAt: string;
}

export interface IntegrationSettings {
  outboundEnabled: boolean;
  maxAttempts: number;
}

export interface ErpRecord {
  id: ID;
  system: string;
  objectType: ErpObjectType;
  externalId: string;
  payload: Record<string, unknown>;
  simulated: boolean;
  sourceUpdatedAt?: string;
  updatedAt: string;
}

export interface IntegrationApi {
  status(): Promise<IntegrationStatus>;
  settings(): Promise<IntegrationSettings>;
  runs(limit: number): Promise<IntegrationSyncRun[]>;
  outbox(limit: number): Promise<IntegrationOutboxItem[]>;
  /** Nombre d'enregistrements reçus par type */
  recordCounts(): Promise<Record<ErpObjectType, number>>;
  records(objectType: ErpObjectType, limit: number): Promise<ErpRecord[]>;
  sync(options: { scenario?: string; dataVersion?: 1 | 2 }): Promise<IntegrationSyncRun>;
  processOutbox(options: { scenario?: string }): Promise<{ processed: number; sent: number; retried: number; dead: number }>;
  retryOutbox(id: ID): Promise<void>;
  enqueueTest(kind: 'quality' | 'maintenance'): Promise<void>;
  configure(settings: { outboundEnabled: boolean }): Promise<void>;
}

export interface AuditEntry {
  id: ID;
  at: string;
  actorId?: ID;
  event: string;
  resource: string;
  resourceId?: string;
  detail: Record<string, unknown>;
}

export interface AccountAdmin {
  create(input: NewEntity<User>): Promise<{ user: User; temporaryPassword: string }>;
  resetPassword(userId: ID): Promise<{ temporaryPassword: string }>;
}

export type Dataset = { [K in CollectionName]: CollectionMap[K][] };

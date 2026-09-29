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

export type DataMode = 'demo' | 'api';

export interface DataSource {
  readonly kind: DataMode;
  repo<K extends CollectionName>(name: K): Repository<CollectionMap[K]>;
  /** Recharge le jeu de démonstration. Indisponible en mode API. */
  resetDemoData?: () => Promise<void>;
}

export type Dataset = { [K in CollectionName]: CollectionMap[K][] };

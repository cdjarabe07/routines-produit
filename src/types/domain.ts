/* ============================================================
   Modèle de données — entités métier.
   Les valeurs dérivées (retard, occurrences planifiées, conformité,
   état d'un poste…) ne sont jamais stockées : voir features/<module>/model.ts.
   Documentation : docs/data-model.md
   ============================================================ */

export type ID = string;
/** Horodatage ISO 8601 complet (UTC), ex. 2026-09-29T06:31:12.000Z */
export type ISODateTime = string;
/** Date calendaire locale de l'atelier, format AAAA-MM-JJ */
export type DateKey = string;
/** Heure locale HH:mm */
export type TimeOfDay = string;

export interface BaseEntity {
  id: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ---------- Organisation ---------- */

export type Role = 'operator' | 'hancho' | 'line_leader' | 'quality' | 'manager' | 'admin';
export type Shift = 'morning' | 'afternoon' | 'night';

export interface User extends BaseEntity {
  name: string;
  email: string;
  role: Role;
  lineId?: ID;
  zoneLabel?: string;
  shift?: Shift;
  /** Équipe de rattachement (le quart et la ligne sont alors repris de l'équipe) */
  teamId?: ID;
  /** Poste habituel */
  workstationId?: ID;
  active: boolean;
  lastSignInAt?: ISODateTime;
}

/** Équipe : groupe de personnes d'un même quart, éventuellement rattaché à une ligne. */
export interface Team extends BaseEntity {
  name: string;
  /** Absent : l'équipe couvre plusieurs quarts */
  shift?: Shift;
  lineId?: ID;
  leaderId?: ID;
  active: boolean;
}

/** Ligne de production. Joue le rôle de « zone » (docs/role-model.md §3). */
export interface Line extends BaseEntity {
  code: string;
  name: string;
  description?: string;
}

export interface Workstation extends BaseEntity {
  code: string; // P1…P8 — utilisé dans les QR codes
  name: string;
  process: string; // Sertissage, Coupe…
  lineId: ID;
  /** Position sur le plan de l'atelier, en % (0-100) */
  mapX: number;
  mapY: number;
  active: boolean;
}

export type PresenceStatus = 'present' | 'absent';

export interface PresenceRecord extends BaseEntity {
  userId: ID;
  date: DateKey;
  status: PresenceStatus;
  recordedBy: ID;
}

export interface Leave extends BaseEntity {
  userId: ID;
  from: DateKey;
  to: DateKey;
  reason?: string;
}

/* ---------- Checklists ---------- */

/** Types de contrôle (docs/implementation-plan.md §2). */
export type CheckType = 'conformity' | 'yes_no' | 'number' | 'text' | 'select' | 'comment' | 'lot';

export interface ChecklistItem {
  id: ID;
  label: string;
  type: CheckType;
  required: boolean;
  /** Choix proposés (type « select ») */
  options?: string[];
  /** Unité et bornes de conformité (type « number ») */
  unit?: string;
  min?: number;
  max?: number;
  help?: string;
  knowledgeId?: ID;
  /** Photo jointe au contrôle : proposée ou exigée */
  photo?: 'optional' | 'required';
  /** Commentaire exigé quand le contrôle est non conforme */
  commentOnFail?: boolean;
  /** Anomalie créée automatiquement, avec cette gravité, quand le contrôle est non conforme */
  autoAnomaly?: Severity;
}

/** Checklist réutilisable : une tâche de routine peut y faire référence. */
export interface Checklist extends BaseEntity {
  name: string;
  description?: string;
  items: ChecklistItem[];
  active: boolean;
}

/* ---------- Routines ---------- */

export type Priority = 'low' | 'medium' | 'high' | 'critical';

/** Tâche d'une routine. L'ordre d'exécution est l'ordre du tableau. */
export interface RoutineTask {
  id: ID;
  title: string;
  description?: string;
  instructions?: string;
  estimatedMin?: number;
  priority: Priority;
  /** Une tâche facultative peut rester non faite sans empêcher la clôture */
  required: boolean;
  /** Fonction responsable de la tâche, si elle diffère de l'exécutant de la routine */
  responsibleRole?: Role;
  knowledgeId?: ID;
  /** Checklist réutilisable jointe (bibliothèque) */
  checklistId?: ID;
  /** Contrôles propres à la tâche. Sans aucun contrôle, la tâche se valide en un geste. */
  checks: ChecklistItem[];
  /** Questions tournantes : seuls N contrôles sont posés à chaque exécution, à tour de rôle */
  sampleSize?: number;
}

/** Routine : ce qui doit être fait. Quand et par qui : voir Schedule. */
export interface RoutineTemplate extends BaseEntity {
  title: string;
  description?: string;
  durationMin: number;
  /** Heure proposée par défaut lors de la planification */
  defaultTime: TimeOfDay;
  /** Zone (ligne) et poste concernés */
  lineId?: ID;
  workstationId?: ID;
  tasks: RoutineTask[];
  active: boolean;
}

/** on_demand : aucune occurrence au calendrier, chaque déclenchement (événement) en crée une */
export type Recurrence = 'once' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'on_demand';
/** Déclenchement automatique d'une planification à la demande */
export type ScheduleTrigger = 'order_start';
/** Niveau d'un audit par couches : 1 terrain, 2 encadrement, 3 direction */
export type AuditLayer = 1 | 2 | 3;
export type ScheduleStatus = 'active' | 'cancelled';

/**
 * Planification d'une routine : date, heure, répétition, affectation.
 * Les occurrences (planification × date) sont CALCULÉES, jamais stockées (features/planning/model.ts).
 */
export interface Schedule extends BaseEntity {
  routineId: ID;
  startDate: DateKey;
  endDate?: DateKey;
  time: TimeOfDay;
  /** Répétition dans la journée : toutes les N heures à partir de « time », jusqu'à « endTime » inclus */
  everyHours?: number;
  endTime?: TimeOfDay;
  recurrence: Recurrence;
  /** Planification à la demande : déclenchée automatiquement par cet événement (sinon manuellement) */
  triggerOn?: ScheduleTrigger;
  /** Audit par couches (LPA) : niveau hiérarchique de l'auditeur */
  layer?: AuditLayer;
  /** Jours de la semaine pour « weekly » : 1 = lundi … 7 = dimanche */
  weekdays: number[];
  /** Affectation : une personne, ou une équipe (tous ses membres voient la routine) */
  assigneeId?: ID;
  teamId?: ID;
  lineId?: ID;
  workstationId?: ID;
  status: ScheduleStatus;
  /** Occurrences annulées individuellement */
  skippedDates: DateKey[];
  note?: string;
  createdBy: ID;
}

export type CheckResult = 'ok' | 'ko' | 'na';
export type CheckValue = string | number | boolean;

export interface ItemResult {
  status: CheckResult;
  /** Valeur saisie pour un contrôle typé (oui/non, nombre, texte, choix) */
  value?: CheckValue;
  comment?: string;
  at: ISODateTime;
  by: ID;
  anomalyId?: ID;
  /** Photo jointe (collection runPhotos : une photo pèse trop pour le résultat lui-même) */
  photoId?: ID;
}

/** Photo prise lors d'un contrôle de routine */
export interface RunPhoto extends BaseEntity {
  runId: ID;
  /** Clé du résultat (tâche/contrôle) */
  key: string;
  /** Image JPEG ré-encodée par l'application */
  photo: string;
  takenBy: ID;
}

/** Exécution d'une occurrence planifiée. */
/** Déclenchement d'une planification à la demande : une occurrence au créneau (heure) du déclenchement */
export interface RoutineTrigger extends BaseEntity {
  scheduleId: ID;
  date: DateKey;
  slot: TimeOfDay;
  reason: string;
  /** Ordre de fabrication à l'origine du déclenchement */
  orderId?: ID;
  /** Absent pour un déclenchement automatique hors session (ERP) */
  triggeredBy?: ID;
}

export interface RoutineRun extends BaseEntity {
  scheduleId: ID;
  templateId: ID;
  date: DateKey;
  /** Créneau de la journée (planification répétée dans la journée) ; absent = créneau unique */
  slot?: TimeOfDay;
  /** Questions tournantes : contrôles posés à cette exécution, par tâche (fixés au démarrage) */
  sample?: Record<ID, ID[]>;
  /** Personne qui a démarré l'exécution */
  assigneeId: ID;
  startedAt: ISODateTime;
  /** Clé : id de tâche (tâche sans contrôle) ou « tâche/contrôle » */
  results: Record<string, ItemResult>;
  completedAt?: ISODateTime;
  completedBy?: ID;
}

/* ---------- Actions & commentaires ---------- */

export type ActionStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type ActionSourceType = 'manual' | 'meeting' | 'anomaly' | 'gemba' | 'routine' | 'andon' | 'quality';

export interface Action extends BaseEntity {
  title: string;
  description?: string;
  assigneeId: ID;
  backupId?: ID;
  priority: Priority;
  status: ActionStatus;
  dueDate: DateKey;
  source: { type: ActionSourceType; id?: ID };
  createdBy: ID;
  blockedReason?: string;
  /** Ce qui a été fait, saisi à la clôture */
  resolutionNote?: string;
  closedAt?: ISODateTime;
}

export type CommentTarget = 'action' | 'anomaly' | 'gembaWalk' | 'andonAlert' | 'routineRun' | 'meeting';

export interface Comment extends BaseEntity {
  targetType: CommentTarget;
  targetId: ID;
  /** Élément précis commenté dans la cible (ex. tâche d'une routine) */
  anchorId?: ID;
  authorId: ID;
  text: string;
  editedAt?: ISODateTime;
}

/* ---------- Anomalies ---------- */

/** Catégorie d’anomalie : clé du catalogue du site (src/app/catalog.ts) */
export type AnomalyCategory = string;
export type Severity = 'minor' | 'major' | 'critical';
export type AnomalyStatus = 'open' | 'in_progress' | 'closed';
export type AnomalyOrigin = 'manual' | 'qr' | 'routine' | 'quality' | 'andon' | 'gemba';

export interface Anomaly extends BaseEntity {
  description: string;
  category: AnomalyCategory;
  severity: Severity;
  workstationId?: ID;
  status: AnomalyStatus;
  reportedBy: ID;
  photo?: string; // data URL compressée (stockage local) ou URL (API)
  origin: { type: AnomalyOrigin; id?: ID };
  closedAt?: ISODateTime;
  closedBy?: ID;
  resolutionNote?: string;
}

/* ---------- Andon ---------- */

export type AndonType = 'quality' | 'equipment' | 'material' | 'safety';
export type AndonUrgency = 'low' | 'medium' | 'critical';
/** Nouveau → Pris en charge → En résolution → Résolu */
export type AndonStatus = 'active' | 'acknowledged' | 'in_progress' | 'resolved';

export interface AndonAlert extends BaseEntity {
  workstationId: ID;
  type: AndonType;
  urgency: AndonUrgency;
  detail: string;
  status: AndonStatus;
  raisedBy: ID;
  raisedAt: ISODateTime;
  acknowledgedBy?: ID;
  acknowledgedAt?: ISODateTime;
  resolutionStartedAt?: ISODateTime;
  resolvedBy?: ID;
  resolvedAt?: ISODateTime;
  rootCause?: string;
  resolution?: string;
}

/* ---------- Séquences guidées ---------- */

export interface SequenceStep {
  id: ID;
  title: string;
  instruction?: string;
  durationMin: number;
  plannedTime?: TimeOfDay;
  knowledgeId?: ID;
  /** Critère à confirmer avant de passer à l'étape suivante */
  validation?: string;
  /** Une étape désactivée est ignorée à l'exécution */
  active: boolean;
}

export interface SequenceTemplate extends BaseEntity {
  name: string;
  description?: string;
  steps: SequenceStep[];
  active: boolean;
}

export type SequenceRunStatus = 'running' | 'paused' | 'completed' | 'aborted';

export interface SequenceStepLog {
  stepId: ID;
  /** Temps cumulé des segments terminés, en ms */
  elapsedMs: number;
  completedAt?: ISODateTime;
}

export interface SequenceRun extends BaseEntity {
  templateId: ID;
  date: DateKey;
  startedBy: ID;
  status: SequenceRunStatus;
  currentStepIndex: number;
  /** Début du segment en cours (null si en pause ou terminé) */
  segmentStartedAt: ISODateTime | null;
  steps: SequenceStepLog[];
  completedAt?: ISODateTime;
}

/* ---------- Production ---------- */

/** Étape de fabrication : clé du catalogue du site (src/app/catalog.ts) */
export type ProductionStage = string;
export type ProductionStatus = 'planned' | 'in_progress' | 'blocked' | 'done';

export interface ProductionOrder extends BaseEntity {
  reference: string;
  harnessRef: string;
  lineId: ID;
  quantityPlanned: number;
  quantityDone: number;
  stage: ProductionStage;
  status: ProductionStatus;
  blockedReason?: string;
  ownerId?: ID;
  dueDate: DateKey;
}

export interface MaterialStock extends BaseEntity {
  material: string;
  workstationId: ID;
  quantity: number;
  min: number;
  target: number;
  unit: string;
}

export type StockMovementReason = 'consumption' | 'replenishment' | 'adjustment';

export interface StockMovement extends BaseEntity {
  stockId: ID;
  delta: number;
  reason: StockMovementReason;
  by: ID;
}

/* ---------- Gemba Walk ---------- */

export interface GembaChecklistEntry {
  id: ID;
  label: string;
  result?: CheckResult;
  comment?: string;
}

export interface GembaObservation {
  id: ID;
  finding: string;
  improvement: string;
  severity: Severity;
  workstationId?: ID;
  photo?: string;
  actionId?: ID;
}

export type GembaStatus = 'draft' | 'validated' | 'closed';

export interface GembaWalk extends BaseEntity {
  date: DateKey;
  zone: string;
  leaderId: ID;
  participantIds: ID[];
  checklist: GembaChecklistEntry[];
  observations: GembaObservation[];
  status: GembaStatus;
  validatedAt?: ISODateTime;
  closedAt?: ISODateTime;
}

/* ---------- Qualité LQC ---------- */

export interface QualityCheck extends BaseEntity {
  characteristic: string;
  workstationId: ID;
  value: number;
  min: number;
  max: number;
  unit: string;
  measuredBy: ID;
  comment?: string;
  anomalyId?: ID;
}

/* ---------- Connaissances ---------- */

export type KnowledgeCategory = 'safety' | '5s' | 'standard' | 'quality' | 'performance' | 'production' | 'material';
export type KnowledgeKind = 'standard' | 'link';
export type KnowledgeStatus = 'draft' | 'published' | 'archived';

export interface KnowledgeItem extends BaseEntity {
  code: string;
  title: string;
  category: KnowledgeCategory;
  kind: KnowledgeKind;
  summary: string;
  keyPoints: string[];
  url?: string;
  version: string;
  owner: string;
  status: KnowledgeStatus;
  /** Contenu initial à faire valider par son propriétaire (visible uniquement des gestionnaires du centre) */
  toReview: boolean;
}

export interface Favorite extends BaseEntity {
  userId: ID;
  knowledgeId: ID;
}

/* ---------- Agenda, réunions, passations, annonces ---------- */

export type MeetingStatus = 'planned' | 'in_progress' | 'done' | 'cancelled';
/** Type d'événement d'agenda. Réunion, briefing et daily ont un ordre du jour et un compte-rendu. */
export type EventType = 'meeting' | 'briefing' | 'daily' | 'training' | 'audit' | 'maintenance' | 'operational';

export interface AgendaPoint {
  id: ID;
  label: string;
  done: boolean;
}

/** Événement d'agenda (réunion, briefing, formation, audit…). */
export interface Meeting extends BaseEntity {
  title: string;
  type: EventType;
  date: DateKey;
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  location?: string;
  description?: string;
  /** Responsable : anime la réunion */
  organizerId: ID;
  /** Invités */
  participantIds: ID[];
  /** Équipes invitées : tous leurs membres sont participants */
  teamIds: ID[];
  /** Présents, saisis pendant la réunion */
  attendeeIds: ID[];
  agenda: AgendaPoint[];
  minutes: string;
  status: MeetingStatus;
  /** Série créée par répétition */
  seriesId?: ID;
}

export interface Handover extends BaseEntity {
  fromShift: Shift;
  toShift: Shift;
  note: string;
  workstationId?: ID;
  authorId: ID;
  acknowledgedBy?: ID;
  acknowledgedAt?: ISODateTime;
}

export interface Announcement extends BaseEntity {
  text: string;
  date: DateKey;
  authorId: ID;
}

/* ---------- Notifications & paramètres ---------- */

export type NotificationKind =
  'action_assigned' | 'andon_raised' | 'comment_added' | 'anomaly_reported' | 'routine_assigned' | 'meeting_invited' | 'access_request';

export interface AppNotification extends BaseEntity {
  userId: ID;
  kind: NotificationKind;
  title: string;
  link?: string;
  readAt?: ISODateTime;
}

export interface AppSettings extends BaseEntity {
  plantName: string;
  andonEscalationMinutes: number;
  routineLateToleranceMinutes: number;
  /** Fuseau de l'usine : le serveur en déduit la date du jour (mode Supabase). */
  timezone?: string;
  /** Environnement serveur : la réinitialisation n'est possible qu'en démonstration. */
  environment?: 'demo' | 'production';
  /** Modules masqués par l'administrateur (src/app/modules.ts) ; vide = tout est actif. */
  disabledModules?: string[];
  /** Référentiels du site (étapes, catégories, motifs, vocabulaire) ; absents = valeurs par défaut */
  catalog?: Partial<Catalog>;
  /** Modèle de secteur appliqué à la mise en route ; absent = mise en route à faire (entreprise cliente sur serveur) */
  sectorTemplate?: 'generic' | 'automotive' | 'plastics' | 'machining' | 'food' | 'electronics';
}

export interface CatalogEntry {
  key: string;
  label: string;
}

export interface ShiftSetting {
  label: string;
  short: string;
  active: boolean;
}

/** Référentiels propres à chaque site : la terminologie et les listes de choix de son secteur. */
export interface Catalog {
  /** Étapes de fabrication, dans l’ordre du flux */
  productionStages: CatalogEntry[];
  anomalyCategories: CatalogEntry[];
  /** Motifs proposés lors du déclenchement d’un Andon, par type */
  andonPresets: Record<AndonType, string[]>;
  /** Nom affiché de chaque rôle (les droits ne changent pas) */
  roleLabels: Record<Role, string>;
  /** Postes horaires : nom, nom court, utilisé ou non sur le site */
  shifts: Record<Shift, ShiftSetting>;
}

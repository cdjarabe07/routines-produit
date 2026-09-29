/* ============================================================
   Modèle de données — entités métier.
   Les valeurs dérivées (retard, conformité, état d'un poste…)
   ne sont jamais stockées : voir features/<module>/model.ts.
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
  active: boolean;
}

export interface Line extends BaseEntity {
  code: string;
  name: string;
  description?: string;
}

export interface Workstation extends BaseEntity {
  code: string;          // P1…P8 — utilisé dans les QR codes
  name: string;
  process: string;       // Sertissage, Coupe…
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

/* ---------- Routines ---------- */

export interface RoutineItem {
  id: ID;
  label: string;
  knowledgeId?: ID;
}

export interface RoutineSection {
  id: ID;
  title: string;
  items: RoutineItem[];
}

export interface RoutineTemplate extends BaseEntity {
  title: string;
  description?: string;
  role: Role;
  scheduledTime: TimeOfDay;
  sections: RoutineSection[];
  active: boolean;
}

export type CheckResult = 'ok' | 'ko' | 'na';

export interface ItemResult {
  status: CheckResult;
  comment?: string;
  at: ISODateTime;
  by: ID;
  anomalyId?: ID;
}

export interface RoutineRun extends BaseEntity {
  templateId: ID;
  date: DateKey;
  assigneeId: ID;
  results: Record<ID, ItemResult>;
  completedAt?: ISODateTime;
}

/* ---------- Actions & commentaires ---------- */

export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type ActionStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
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
  closedAt?: ISODateTime;
}

export type CommentTarget = 'action' | 'anomaly' | 'gembaWalk' | 'andonAlert';

export interface Comment extends BaseEntity {
  targetType: CommentTarget;
  targetId: ID;
  authorId: ID;
  text: string;
  editedAt?: ISODateTime;
}

/* ---------- Anomalies ---------- */

export type AnomalyCategory =
  | 'safety' | 'quality' | '5s' | 'standard' | 'performance' | 'equipment' | 'material' | 'other';
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
  photo?: string;       // data URL compressée (DÉMO) ou URL (API)
  origin: { type: AnomalyOrigin; id?: ID };
  closedAt?: ISODateTime;
  closedBy?: ID;
  resolutionNote?: string;
}

/* ---------- Andon ---------- */

export type AndonType = 'quality' | 'equipment' | 'material' | 'safety';
export type AndonUrgency = 'normal' | 'critical';
export type AndonStatus = 'active' | 'acknowledged' | 'resolved';

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

export type ProductionStage =
  | 'cutting' | 'crimping' | 'assembly' | 'taping' | 'electrical_test' | 'inspection' | 'shipping';
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
export type KnowledgeStatus = 'draft' | 'published';

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
  /** Contenu d'exemple issu du prototype, à remplacer par les standards réels */
  isExample: boolean;
}

export interface Favorite extends BaseEntity {
  userId: ID;
  knowledgeId: ID;
}

/* ---------- Réunions, passations, annonces ---------- */

export type MeetingStatus = 'planned' | 'in_progress' | 'done';

export interface AgendaPoint {
  id: ID;
  label: string;
  done: boolean;
}

export interface Meeting extends BaseEntity {
  title: string;
  date: DateKey;
  startTime: TimeOfDay;
  durationMin: number;
  organizerId: ID;
  participantIds: ID[];
  agenda: AgendaPoint[];
  minutes: string;
  status: MeetingStatus;
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

export type NotificationKind = 'action_assigned' | 'andon_raised' | 'comment_added' | 'anomaly_reported';

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
}

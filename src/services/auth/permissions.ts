import type { Role } from '@/types/domain';

/* Source unique des droits. Les composants ne testent jamais un rôle,
   seulement une permission (via useAuth().can ou <Can>). */

export type Permission =
  | 'routine.execute'
  | 'routine.manage'
  | 'sequence.run'
  | 'sequence.manage'
  | 'action.create'
  | 'action.manage'
  | 'anomaly.create'
  | 'anomaly.manage'
  | 'andon.raise'
  | 'andon.respond'
  | 'production.update'
  | 'gemba.conduct'
  | 'quality.record'
  | 'meeting.manage'
  | 'handover.write'
  | 'announcement.write'
  | 'team.updateStatus'
  | 'leave.manage'
  | 'knowledge.manage'
  | 'reporting.view'
  | 'admin.access';

const FIELD: Permission[] = ['sequence.run', 'anomaly.create', 'andon.raise'];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  operator: [...FIELD],
  hancho: [...FIELD, 'routine.execute', 'action.create', 'anomaly.manage', 'andon.respond', 'production.update', 'handover.write'],
  line_leader: [
    ...FIELD,
    'routine.execute',
    'sequence.manage',
    'action.create',
    'action.manage',
    'anomaly.manage',
    'andon.respond',
    'production.update',
    'gemba.conduct',
    'meeting.manage',
    'handover.write',
    'announcement.write',
    'team.updateStatus',
    'reporting.view',
  ],
  quality: [
    ...FIELD,
    'routine.execute',
    'action.create',
    'action.manage',
    'anomaly.manage',
    'andon.respond',
    'gemba.conduct',
    'quality.record',
    'handover.write',
    'knowledge.manage',
    'reporting.view',
  ],
  manager: [
    ...FIELD,
    'routine.execute',
    'routine.manage',
    'sequence.manage',
    'action.create',
    'action.manage',
    'anomaly.manage',
    'andon.respond',
    'production.update',
    'gemba.conduct',
    'quality.record',
    'meeting.manage',
    'handover.write',
    'announcement.write',
    'team.updateStatus',
    'leave.manage',
    'knowledge.manage',
    'reporting.view',
  ],
  admin: [
    ...FIELD,
    'routine.execute',
    'routine.manage',
    'sequence.manage',
    'action.create',
    'action.manage',
    'anomaly.manage',
    'andon.respond',
    'production.update',
    'gemba.conduct',
    'quality.record',
    'meeting.manage',
    'handover.write',
    'announcement.write',
    'team.updateStatus',
    'leave.manage',
    'knowledge.manage',
    'reporting.view',
    'admin.access',
  ],
};

export const ALL_PERMISSIONS: Permission[] = Array.from(new Set(Object.values(ROLE_PERMISSIONS).flat()));

export function roleCan(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_LABELS: Record<Role, string> = {
  operator: 'Opérateur',
  hancho: 'Hancho',
  line_leader: 'Line Leader',
  quality: 'Qualité (LQC)',
  manager: 'Manager',
  admin: 'Administrateur',
};

export const ROLE_ORDER: Role[] = ['operator', 'hancho', 'line_leader', 'quality', 'manager', 'admin'];

export const PERMISSION_LABELS: Record<Permission, string> = {
  'routine.execute': 'Exécuter ses routines',
  'routine.manage': 'Gérer les modèles de routines',
  'sequence.run': 'Exécuter une séquence guidée',
  'sequence.manage': 'Gérer les séquences',
  'action.create': 'Créer une action',
  'action.manage': 'Modifier toutes les actions',
  'anomaly.create': 'Signaler une anomalie',
  'anomaly.manage': 'Traiter et clôturer les anomalies',
  'andon.raise': 'Déclencher un Andon',
  'andon.respond': 'Prendre en charge et résoudre un Andon',
  'production.update': 'Mettre à jour la production et les stocks',
  'gemba.conduct': 'Conduire une Gemba Walk',
  'quality.record': 'Saisir des mesures LQC',
  'meeting.manage': 'Animer les réunions',
  'handover.write': 'Rédiger une passation',
  'announcement.write': 'Publier l’annonce du jour',
  'team.updateStatus': 'Saisir les présences',
  'leave.manage': 'Gérer les congés',
  'knowledge.manage': 'Gérer le centre de connaissances',
  'reporting.view': 'Consulter le reporting',
  'admin.access': 'Administration',
};

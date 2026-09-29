import type { Role } from '@/types/domain';

/* Source unique des droits (docs/permission-matrix.md).
   Les composants ne testent jamais un rôle, seulement une permission
   (useAuth().can, <Can>, RequirePermission). Les règles qui dépendent
   d'une ressource (action confiée, routine affectée…) sont dans policies.ts. */

export type Permission =
  // Espaces
  | 'space.app'
  | 'space.supervision'
  | 'space.admin'
  // Exécution
  | 'routine.execute'
  | 'sequence.run'
  | 'comment.write'
  | 'anomaly.create'
  | 'andon.raise'
  | 'action.create'
  | 'action.update'
  | 'handover.write'
  | 'meeting.view'
  | 'meeting.run'
  // Supervision
  | 'routine.supervise'
  | 'team.updateStatus'
  | 'leave.manage'
  | 'andon.respond'
  | 'anomaly.manage'
  | 'action.manage'
  | 'production.view'
  | 'production.update'
  | 'gemba.conduct'
  | 'quality.record'
  | 'announcement.write'
  | 'reporting.view'
  // Configuration
  | 'routine.manage'
  | 'checklist.manage'
  | 'sequence.manage'
  | 'schedule.manage'
  | 'meeting.manage'
  | 'agenda.manage'
  | 'knowledge.manage'
  | 'user.manage'
  | 'team.manage'
  | 'workstation.manage'
  | 'settings.manage';

/** Ce que tout utilisateur peut faire sur le terrain. */
const FIELD: Permission[] = [
  'space.app',
  'routine.execute',
  'sequence.run',
  'comment.write',
  'anomaly.create',
  'andon.raise',
  'action.update',
  'meeting.view',
];

const SUPERVISION: Permission[] = [
  'space.supervision',
  'routine.supervise',
  'team.updateStatus',
  'andon.respond',
  'anomaly.manage',
  'action.create',
  'action.manage',
  'production.view',
  'production.update',
  'gemba.conduct',
  'announcement.write',
  'reporting.view',
  'handover.write',
  'meeting.run',
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  operator: [...FIELD],
  hancho: [
    ...FIELD,
    'space.supervision',
    'action.create',
    'handover.write',
    'andon.respond',
    'anomaly.manage',
    'production.view',
    'production.update',
  ],
  quality: [
    ...FIELD,
    'space.supervision',
    'action.create',
    'action.manage',
    'handover.write',
    'andon.respond',
    'anomaly.manage',
    'production.view',
    'gemba.conduct',
    'quality.record',
    'reporting.view',
  ],
  line_leader: [...FIELD, ...SUPERVISION],
  manager: [
    ...FIELD,
    ...SUPERVISION,
    'leave.manage',
    'quality.record',
    'space.admin',
    'schedule.manage',
    'meeting.manage',
    'agenda.manage',
  ],
  admin: [
    ...FIELD,
    ...SUPERVISION,
    'leave.manage',
    'quality.record',
    'space.admin',
    'routine.manage',
    'checklist.manage',
    'sequence.manage',
    'schedule.manage',
    'meeting.manage',
    'agenda.manage',
    'knowledge.manage',
    'user.manage',
    'team.manage',
    'workstation.manage',
    'settings.manage',
  ],
};

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

export const ROLE_ORDER: Role[] = ['operator', 'hancho', 'quality', 'line_leader', 'manager', 'admin'];

/* ---------- Profils (docs/role-model.md) ---------- */

export type Profile = 'user' | 'manager' | 'admin';

export const ROLE_PROFILE: Record<Role, Profile> = {
  operator: 'user',
  hancho: 'user',
  quality: 'user',
  line_leader: 'manager',
  manager: 'manager',
  admin: 'admin',
};

export const PROFILE_LABELS: Record<Profile, string> = {
  user: 'Utilisateur',
  manager: 'Responsable',
  admin: 'Administrateur',
};

/** Écran d'accueil après connexion, selon le profil. */
const PROFILE_HOME: Record<Profile, string> = {
  user: '/app',
  manager: '/manager',
  admin: '/admin/dashboard',
};

export const homePath = (role: Role) => PROFILE_HOME[ROLE_PROFILE[role]];

/* ---------- Libellés, groupés pour l'écran « Rôles et droits » ---------- */

export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  { label: 'Espaces', permissions: ['space.app', 'space.supervision', 'space.admin'] },
  {
    label: 'Exécution',
    permissions: [
      'routine.execute',
      'sequence.run',
      'comment.write',
      'anomaly.create',
      'andon.raise',
      'action.create',
      'action.update',
      'handover.write',
      'meeting.view',
      'meeting.run',
    ],
  },
  {
    label: 'Supervision',
    permissions: [
      'routine.supervise',
      'team.updateStatus',
      'leave.manage',
      'andon.respond',
      'anomaly.manage',
      'action.manage',
      'production.view',
      'production.update',
      'gemba.conduct',
      'quality.record',
      'announcement.write',
      'reporting.view',
    ],
  },
  {
    label: 'Configuration',
    permissions: [
      'routine.manage',
      'checklist.manage',
      'sequence.manage',
      'schedule.manage',
      'meeting.manage',
      'agenda.manage',
      'knowledge.manage',
      'user.manage',
      'team.manage',
      'workstation.manage',
      'settings.manage',
    ],
  },
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  'space.app': 'Espace « Mon travail »',
  'space.supervision': 'Espace « Supervision »',
  'space.admin': 'Espace « Administration »',
  'routine.execute': 'Exécuter les routines qui lui sont affectées',
  'sequence.run': 'Exécuter une séquence guidée',
  'comment.write': 'Commenter',
  'anomaly.create': 'Signaler une anomalie',
  'andon.raise': 'Déclencher un Andon',
  'action.create': 'Créer une action',
  'action.update': 'Mettre à jour les actions qui lui sont confiées',
  'meeting.view': 'Voir les réunions auxquelles il est invité',
  'handover.write': 'Rédiger une passation',
  'meeting.run': 'Animer les réunions dont il est responsable',
  'routine.supervise': 'Suivre les routines de toutes les personnes',
  'team.updateStatus': 'Saisir les présences',
  'leave.manage': 'Gérer les congés',
  'andon.respond': 'Prendre en charge et résoudre un Andon',
  'anomaly.manage': 'Traiter et clôturer les anomalies',
  'action.manage': 'Gérer toutes les actions',
  'production.view': 'Voir la production et le plan de l’atelier',
  'production.update': 'Mettre à jour la production et les stocks',
  'gemba.conduct': 'Conduire une Gemba Walk',
  'quality.record': 'Saisir des mesures LQC',
  'announcement.write': 'Publier l’annonce du jour',
  'reporting.view': 'Consulter le reporting',
  'routine.manage': 'Créer et modifier les routines et leurs tâches',
  'checklist.manage': 'Gérer les checklists',
  'sequence.manage': 'Gérer les séquences guidées',
  'schedule.manage': 'Planifier et affecter les routines',
  'meeting.manage': 'Créer, modifier et supprimer les réunions',
  'agenda.manage': 'Gérer les événements de l’agenda',
  'knowledge.manage': 'Gérer le centre de connaissances',
  'user.manage': 'Gérer les utilisateurs',
  'team.manage': 'Gérer les équipes',
  'workstation.manage': 'Gérer les postes et QR codes',
  'settings.manage': 'Paramètres de l’application',
};

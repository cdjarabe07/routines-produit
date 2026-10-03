import type { Permission } from '@/services/auth/permissions';

/* Étapes du processus de travail : de la configuration au pilotage, puis retour aux standards.
   Chaque nœud propose des écrans ; le premier auquel l'utilisateur a accès devient le lien du nœud. */

export interface ProcessLink {
  to: string;
  /** Toutes ces permissions sont nécessaires (espace + écran) */
  permissions: Permission[];
}

export interface ProcessNode {
  key: string;
  title: string;
  description: string;
  /** Clé des chiffres calculés par workMetrics */
  metrics?: string;
  links: ProcessLink[];
}

export interface ProcessStage {
  key: string;
  title: string;
  nodes: ProcessNode[];
}

export const PROCESS_STAGES: ProcessStage[] = [
  {
    key: 'configure',
    title: 'Configurer',
    nodes: [
      {
        key: 'standards',
        title: 'Routines et checklists',
        description: 'Les standards de travail : quoi vérifier, à quelle fréquence, avec quelle checklist.',
        metrics: 'standards',
        links: [{ to: '/admin/routines', permissions: ['space.admin', 'routine.manage'] }],
      },
      {
        key: 'organisation',
        title: 'Équipes et postes',
        description: 'Qui travaille où : utilisateurs, équipes, lignes et postes avec leur QR code.',
        links: [
          { to: '/admin/equipes', permissions: ['space.admin', 'team.manage'] },
          { to: '/admin/postes', permissions: ['space.admin', 'workstation.manage'] },
        ],
      },
    ],
  },
  {
    key: 'plan',
    title: 'Planifier',
    nodes: [
      {
        key: 'planning',
        title: 'Planification',
        description: 'Affecter chaque routine à une personne ou une équipe, avec une récurrence.',
        metrics: 'planning',
        links: [
          { to: '/admin/planification', permissions: ['space.admin', 'schedule.manage'] },
          { to: '/app/planning', permissions: ['space.app'] },
        ],
      },
      {
        key: 'meetings',
        title: 'Agenda et réunions',
        description: 'Points quotidiens, briefings, audits et formations du site.',
        metrics: 'meetings',
        links: [
          { to: '/admin/agenda', permissions: ['space.admin', 'agenda.manage'] },
          { to: '/app/reunions', permissions: ['space.app', 'meeting.view'] },
        ],
      },
    ],
  },
  {
    key: 'execute',
    title: 'Exécuter',
    nodes: [
      {
        key: 'routines',
        title: 'Routines du jour',
        description: 'Chacun exécute ses routines et remplit la checklist, au poste.',
        metrics: 'routines',
        links: [
          { to: '/manager/routines', permissions: ['space.supervision', 'routine.supervise'] },
          { to: '/app/routines', permissions: ['space.app', 'routine.execute'] },
        ],
      },
      {
        key: 'sequences',
        title: 'Séquences guidées et passation',
        description: 'Opérations pas à pas, puis transmission des consignes à l’équipe suivante.',
        links: [
          { to: '/app/sequences', permissions: ['space.app', 'sequence.run'] },
          { to: '/app/passation', permissions: ['space.app'] },
        ],
      },
    ],
  },
  {
    key: 'detect',
    title: 'Détecter et signaler',
    nodes: [
      {
        key: 'andon',
        title: 'Andon',
        description: 'Alerte immédiate quand un poste est arrêté ou en difficulté.',
        metrics: 'andon',
        links: [{ to: '/andon', permissions: [] }],
      },
      {
        key: 'anomalies',
        title: 'Anomalies',
        description: 'Écart constaté pendant une routine ou sur le terrain, avec photo et gravité.',
        metrics: 'anomalies',
        links: [
          { to: '/manager/anomalies', permissions: ['space.supervision', 'anomaly.manage'] },
          { to: '/signaler', permissions: ['anomaly.create'] },
        ],
      },
      {
        key: 'quality',
        title: 'Contrôles LQC',
        description: 'Mesures qualité en ligne comparées aux tolérances.',
        metrics: 'quality',
        links: [{ to: '/manager/qualite', permissions: ['space.supervision', 'quality.record'] }],
      },
    ],
  },
  {
    key: 'correct',
    title: 'Corriger',
    nodes: [
      {
        key: 'actions',
        title: 'Actions correctives',
        description: 'Chaque problème devient une action avec un responsable et une échéance.',
        metrics: 'actions',
        links: [
          { to: '/manager/actions', permissions: ['space.supervision', 'action.manage'] },
          { to: '/app/actions', permissions: ['space.app', 'action.update'] },
        ],
      },
      {
        key: 'gemba',
        title: 'Gemba Walk',
        description: 'Tournée terrain : les observations à traiter deviennent des actions.',
        links: [{ to: '/manager/gemba', permissions: ['space.supervision', 'gemba.conduct'] }],
      },
    ],
  },
  {
    key: 'steer',
    title: 'Piloter',
    nodes: [
      {
        key: 'supervision',
        title: 'Supervision et plan de l’atelier',
        description: 'État des équipes, des postes et de la production en temps réel.',
        links: [
          { to: '/manager', permissions: ['space.supervision'] },
          { to: '/manager/atelier', permissions: ['space.supervision', 'production.view'] },
        ],
      },
      {
        key: 'reporting',
        title: 'Reporting',
        description: 'Taux de réalisation, tendances et causes récurrentes pour améliorer les standards.',
        links: [{ to: '/manager/reporting', permissions: ['space.supervision', 'reporting.view'] }],
      },
    ],
  },
];

/** Premier écran du nœud accessible à l'utilisateur, ou null */
export function linkFor(node: ProcessNode, can: (p: Permission) => boolean): string | null {
  return node.links.find((l) => l.permissions.every((p) => can(p)))?.to ?? null;
}

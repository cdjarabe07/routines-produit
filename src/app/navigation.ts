import type { LucideIcon } from 'lucide-react';
import {
  Network,
  ScrollText,
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Factory,
  Footprints,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  PlayCircle,
  QrCode,
  Ruler,
  Settings,
  ShieldCheck,
  Siren,
  TriangleAlert,
  Users,
  UserCog,
  Presentation,
  Workflow,
} from 'lucide-react';
import type { Permission } from '@/services/auth/permissions';
import type { Role } from '@/types/domain';
import { ROLE_PROFILE } from '@/services/auth/permissions';

/* Espaces et menus (docs/role-model.md).
   Chaque espace a son menu ; un élément n'apparaît que si l'utilisateur a sa permission. */

export type SpaceId = 'app' | 'supervision' | 'admin';

/** Clés des compteurs affichés dans le menu (calculés par useNavCounts). */
export type NavCountKey = 'routines' | 'actions' | 'andon' | 'anomalies' | 'handover';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  count?: NavCountKey;
  /** Correspondance exacte du chemin pour l'état actif (page d'accueil d'un espace) */
  end?: boolean;
  /** Écrans regroupés sous cette entrée (onglets de section) : l'entrée reste active sur chacun */
  match?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface Space {
  id: SpaceId;
  label: string;
  /** Préfixe des routes propres à l'espace */
  prefix: string;
  permission: Permission;
  groups: NavGroup[];
}

export const SPACES: Space[] = [
  {
    id: 'app',
    label: 'Mon travail',
    prefix: '/app',
    permission: 'space.app',
    groups: [
      {
        label: 'Aujourd’hui',
        items: [
          { path: '/app', label: 'Tableau de bord', icon: LayoutDashboard, permission: 'space.app', end: true },
          { path: '/app/planning', label: 'Mon planning', icon: CalendarDays, permission: 'space.app' },
          { path: '/app/routines', label: 'Mes routines', icon: ClipboardCheck, permission: 'routine.execute', count: 'routines' },
          { path: '/app/actions', label: 'Mes actions', icon: ListChecks, permission: 'action.update', count: 'actions' },
          { path: '/app/reunions', label: 'Mes réunions', icon: Presentation, permission: 'meeting.view' },
        ],
      },
      {
        label: 'Sur le terrain',
        items: [
          { path: '/app/sequences', label: 'Séquences guidées', icon: PlayCircle, permission: 'sequence.run' },
          { path: '/andon', label: 'Andon', icon: Siren, permission: 'andon.raise', count: 'andon' },
          { path: '/signaler', label: 'Signaler une anomalie', icon: TriangleAlert, permission: 'anomaly.create' },
          { path: '/app/passation', label: 'Passation', icon: ArrowLeftRight, permission: 'space.app', count: 'handover' },
        ],
      },
      {
        label: 'Ressources',
        items: [
          { path: '/app/connaissances', label: 'Centre de connaissances', icon: BookOpen, permission: 'space.app' },
          { path: '/processus', label: 'Carte du processus', icon: Workflow, permission: 'space.app' },
        ],
      },
    ],
  },
  {
    id: 'supervision',
    label: 'Supervision',
    prefix: '/manager',
    permission: 'space.supervision',
    groups: [
      {
        label: 'Pilotage',
        items: [
          { path: '/manager', label: 'Vue d’ensemble', icon: LayoutDashboard, permission: 'space.supervision', end: true },
          { path: '/manager/equipe', label: 'Équipe', icon: Users, permission: 'team.updateStatus' },
          { path: '/manager/routines', label: 'Suivi des routines', icon: ClipboardList, permission: 'routine.supervise' },
          { path: '/processus', label: 'Carte du processus', icon: Workflow, permission: 'space.supervision' },
          { path: '/manager/reporting', label: 'Reporting', icon: BarChart3, permission: 'reporting.view' },
        ],
      },
      {
        label: 'Opérations',
        items: [
          { path: '/andon', label: 'Andon', icon: Siren, permission: 'andon.respond', count: 'andon' },
          { path: '/manager/production', label: 'Production', icon: Factory, permission: 'production.view' },
        ],
      },
      {
        label: 'Qualité et amélioration',
        items: [
          { path: '/manager/anomalies', label: 'Anomalies', icon: TriangleAlert, permission: 'anomaly.manage', count: 'anomalies' },
          { path: '/manager/actions', label: 'Actions correctives', icon: ListTodo, permission: 'action.manage' },
          { path: '/manager/gemba', label: 'Gemba Walk', icon: Footprints, permission: 'gemba.conduct' },
          { path: '/manager/qualite', label: 'Contrôles LQC', icon: Ruler, permission: 'quality.record' },
        ],
      },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    prefix: '/admin',
    permission: 'space.admin',
    groups: [
      {
        label: 'Pilotage',
        items: [
          { path: '/admin/dashboard', label: 'Tableau de bord', icon: LayoutDashboard, permission: 'settings.manage' },
          { path: '/processus', label: 'Carte du processus', icon: Workflow, permission: 'space.admin' },
        ],
      },
      {
        label: 'Planification',
        items: [
          { path: '/admin/planification', label: 'Planification', icon: CalendarClock, permission: 'schedule.manage' },
          { path: '/admin/agenda', label: 'Agenda et réunions', icon: CalendarDays, permission: 'agenda.manage' },
        ],
      },
      {
        label: 'Contenu',
        items: [
          { path: '/admin/routines', label: 'Routines', icon: ClipboardCheck, permission: 'routine.manage' },
          { path: '/admin/sequences', label: 'Séquences guidées', icon: PlayCircle, permission: 'sequence.manage' },
          { path: '/admin/connaissances', label: 'Centre de connaissances', icon: BookOpen, permission: 'knowledge.manage' },
        ],
      },
      {
        label: 'Organisation',
        items: [
          { path: '/admin/utilisateurs', label: 'Utilisateurs et équipes', icon: UserCog, permission: 'user.manage' },
          { path: '/admin/postes', label: 'Postes et QR codes', icon: QrCode, permission: 'workstation.manage' },
        ],
      },
      {
        label: 'Système',
        items: [
          { path: '/admin/roles', label: 'Rôles et droits', icon: ShieldCheck, permission: 'settings.manage' },
          { path: '/admin/parametres', label: 'Paramètres', icon: Settings, permission: 'settings.manage' },
          { path: '/admin/journal', label: 'Journal et suivi', icon: ScrollText, permission: 'settings.manage' },
          { path: '/admin/integration', label: 'Intégration ERP', icon: Network, permission: 'settings.manage' },
        ],
      },
    ],
  },
];

const PROFILE_SPACE = { user: 'app', manager: 'supervision', admin: 'admin' } as const;

/** Espace d'accueil d'un rôle (docs/role-model.md §4). */
export const homeSpace = (role: Role): SpaceId => PROFILE_SPACE[ROLE_PROFILE[role]];

/** Espace auquel appartient une adresse (null pour les écrans de détail communs). */
export function spaceOfPath(pathname: string): SpaceId | null {
  return SPACES.find((s) => pathname === s.prefix || pathname.startsWith(`${s.prefix}/`))?.id ?? null;
}

/* ---------- Sections : écrans voisins regroupés sous une entrée de menu, avec des onglets ---------- */

export interface SectionTab {
  path: string;
  label: string;
  permission: Permission;
}

export const SECTIONS: SectionTab[][] = [
  [
    { path: '/admin/agenda', label: 'Calendrier', permission: 'agenda.manage' },
    { path: '/admin/reunions', label: 'Gestion des réunions', permission: 'meeting.manage' },
  ],
  [
    { path: '/admin/routines', label: 'Routines', permission: 'routine.manage' },
    { path: '/admin/checklists', label: 'Checklists', permission: 'checklist.manage' },
  ],
  [
    { path: '/admin/utilisateurs', label: 'Utilisateurs', permission: 'user.manage' },
    { path: '/admin/equipes', label: 'Équipes', permission: 'team.manage' },
  ],
  [
    { path: '/manager/production', label: 'Ordres et stocks', permission: 'production.view' },
    { path: '/manager/atelier', label: 'Plan de l’atelier', permission: 'production.view' },
  ],
  [
    { path: '/admin/journal', label: 'Journal d’audit', permission: 'settings.manage' },
    { path: '/admin/erreurs', label: 'Erreurs', permission: 'settings.manage' },
    { path: '/admin/usage', label: 'Utilisation', permission: 'settings.manage' },
  ],
  [
    { path: '/manager/reporting', label: 'Indicateurs', permission: 'reporting.view' },
    { path: '/manager/bi', label: 'Tableaux BI', permission: 'reporting.view' },
  ],
];

type PathFilter = (pathname: string) => boolean;
const always: PathFilter = () => true;

/** Section contenant cet écran (null si l'écran n'est pas regroupé) */
export function sectionOf(pathname: string): SectionTab[] | null {
  return SECTIONS.find((tabs) => tabs.some((t) => t.path === pathname)) ?? null;
}

/** Onglets d'une section accessibles à l'utilisateur (droits et modules actifs) */
export function visibleTabs(tabs: SectionTab[], can: (p: Permission) => boolean, pathEnabled: PathFilter = always): SectionTab[] {
  return tabs.filter((t) => can(t.permission) && pathEnabled(t.path));
}

/** Menu d'un espace, filtré par permission et par module. Une entrée de section mène au premier onglet accessible. */
export function visibleGroups(space: Space, can: (p: Permission) => boolean, pathEnabled: PathFilter = always): NavGroup[] {
  const resolve = (item: NavItem): NavItem | null => {
    const section = sectionOf(item.path);
    if (!section) return can(item.permission) && pathEnabled(item.path) ? item : null;
    const tabs = visibleTabs(section, can, pathEnabled);
    return tabs.length > 0 ? { ...item, path: tabs[0]!.path, match: tabs.map((t) => t.path) } : null;
  };
  return space.groups
    .map((g) => ({ ...g, items: g.items.map(resolve).filter((i): i is NavItem => i !== null) }))
    .filter((g) => g.items.length > 0);
}

/** Espaces accessibles, chacun avec sa première page autorisée. */
export function accessibleSpaces(can: (p: Permission) => boolean) {
  return SPACES.filter((s) => can(s.permission))
    .map((s) => ({ space: s, entry: visibleGroups(s, can)[0]?.items[0]?.path }))
    .filter((s): s is { space: Space; entry: string } => Boolean(s.entry));
}

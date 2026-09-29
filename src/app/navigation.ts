import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight, BarChart3, BookOpen, CalendarDays, ClipboardCheck, Factory, Footprints, Gauge, LayoutDashboard,
  ListChecks, Map as MapIcon, PlayCircle, QrCode, Ruler, Settings, ShieldCheck, Siren, TriangleAlert, Users, UserCog,
} from 'lucide-react';
import type { Permission } from '@/services/auth/permissions';

/** Clés des compteurs affichés dans le menu (calculés par useNavCounts). */
export type NavCountKey = 'routines' | 'actions' | 'andon' | 'anomalies' | 'handover';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  count?: NavCountKey;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/* Organisation métier du menu (docs/functional-spec.md §4). */
export const NAVIGATION: NavGroup[] = [
  {
    label: 'Ma journée',
    items: [
      { path: '/', label: 'Accueil', icon: LayoutDashboard },
      { path: '/routines', label: 'Mes routines', icon: ClipboardCheck, permission: 'routine.execute', count: 'routines' },
      { path: '/actions', label: 'Actions', icon: ListChecks, count: 'actions' },
      { path: '/agenda', label: 'Agenda & réunions', icon: CalendarDays },
      { path: '/passation', label: 'Passation', icon: ArrowLeftRight, count: 'handover' },
      { path: '/equipe', label: 'Équipe', icon: Users },
    ],
  },
  {
    label: 'Opérations',
    items: [
      { path: '/andon', label: 'Andon', icon: Siren, count: 'andon' },
      { path: '/production', label: 'Production', icon: Factory },
      { path: '/atelier', label: 'Plan atelier', icon: MapIcon },
      { path: '/sequences', label: 'Séquences guidées', icon: PlayCircle, permission: 'sequence.run' },
    ],
  },
  {
    label: 'Qualité',
    items: [
      { path: '/anomalies', label: 'Anomalies', icon: TriangleAlert, count: 'anomalies' },
      { path: '/gemba', label: 'Gemba Walk', icon: Footprints },
      { path: '/qualite', label: 'Contrôles LQC', icon: Ruler },
    ],
  },
  {
    label: 'Analyse',
    items: [
      { path: '/reporting', label: 'Reporting', icon: BarChart3, permission: 'reporting.view' },
      { path: '/bi', label: 'Tableaux BI', icon: Gauge, permission: 'reporting.view' },
    ],
  },
  {
    label: 'Ressources',
    items: [{ path: '/connaissances', label: 'Centre de connaissances', icon: BookOpen }],
  },
  {
    label: 'Administration',
    items: [
      { path: '/admin/utilisateurs', label: 'Utilisateurs', icon: UserCog, permission: 'admin.access' },
      { path: '/admin/roles', label: 'Rôles & droits', icon: ShieldCheck, permission: 'admin.access' },
      { path: '/admin/postes', label: 'Postes & QR codes', icon: QrCode, permission: 'admin.access' },
      { path: '/admin/parametres', label: 'Paramètres', icon: Settings, permission: 'admin.access' },
    ],
  },
];

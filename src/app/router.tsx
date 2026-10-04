import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { createHashRouter, Outlet, type RouteObject } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/features/auth/LoginPage';
import type { Permission } from '@/services/auth/permissions';
import { HomeRedirect, LegacyRedirect, RequireAuth, RequirePermission } from './guards';
import { NotFoundPage, RouteErrorPage } from './RouteErrorPage';

/* Table des routes (docs/implementation-plan.md §3).
   Trois espaces protégés par leur permission (space.*), chaque page par la sienne.
   Les écrans de détail communs restent hors préfixe : leurs adresses figurent dans
   les notifications, les QR codes imprimés et les liens enregistrés. */

function page<M extends Record<string, unknown>>(loader: () => Promise<M>, name: keyof M): LazyExoticComponent<ComponentType> {
  return lazy(async () => ({ default: (await loader())[name] as ComponentType }));
}

const P = {
  // Mon travail
  UserDashboard: page(() => import('@/features/workspace/UserDashboardPage'), 'UserDashboardPage'),
  MyPlanning: page(() => import('@/features/workspace/MyPlanningPage'), 'MyPlanningPage'),
  MyRoutines: page(() => import('@/features/workspace/MyRoutinesPage'), 'MyRoutinesPage'),
  RoutineRun: page(() => import('@/features/routines/pages/RoutineRunPage'), 'RoutineRunPage'),
  MyMeetings: page(() => import('@/features/meetings/pages/MyMeetingsPage'), 'MyMeetingsPage'),
  Sequences: page(() => import('@/features/sequences/pages/SequencesPage'), 'SequencesPage'),
  SequenceRun: page(() => import('@/features/sequences/pages/SequenceRunPage'), 'SequenceRunPage'),
  Actions: page(() => import('@/features/actions/pages/ActionsPage'), 'ActionsPage'),
  ActionDetail: page(() => import('@/features/actions/pages/ActionDetailPage'), 'ActionDetailPage'),
  Handover: page(() => import('@/features/team/pages/HandoverPage'), 'HandoverPage'),
  Knowledge: page(() => import('@/features/knowledge/pages/KnowledgePage'), 'KnowledgePage'),
  KnowledgeDetail: page(() => import('@/features/knowledge/pages/KnowledgeDetailPage'), 'KnowledgeDetailPage'),
  ReportAnomaly: page(() => import('@/features/anomalies/pages/ReportAnomalyPage'), 'ReportAnomalyPage'),
  Andon: page(() => import('@/features/andon/pages/AndonPage'), 'AndonPage'),
  AndonDetail: page(() => import('@/features/andon/pages/AndonDetailPage'), 'AndonDetailPage'),
  Meeting: page(() => import('@/features/meetings/pages/MeetingPage'), 'MeetingPage'),
  // Supervision
  ManagerDashboard: page(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage'),
  Team: page(() => import('@/features/team/pages/TeamPage'), 'TeamPage'),
  RoutineMonitor: page(() => import('@/features/routines/pages/RoutineMonitorPage'), 'RoutineMonitorPage'),
  Production: page(() => import('@/features/production/pages/ProductionPage'), 'ProductionPage'),
  PlantMap: page(() => import('@/features/plant/PlantMapPage'), 'PlantMapPage'),
  ProcessMap: page(() => import('@/features/process/ProcessMapPage'), 'ProcessMapPage'),
  Anomalies: page(() => import('@/features/anomalies/pages/AnomaliesPage'), 'AnomaliesPage'),
  AnomalyDetail: page(() => import('@/features/anomalies/pages/AnomalyDetailPage'), 'AnomalyDetailPage'),
  Gemba: page(() => import('@/features/gemba/pages/GembaListPage'), 'GembaListPage'),
  GembaNew: page(() => import('@/features/gemba/pages/GembaFormPage'), 'GembaFormPage'),
  GembaDetail: page(() => import('@/features/gemba/pages/GembaDetailPage'), 'GembaDetailPage'),
  Quality: page(() => import('@/features/quality/QualityPage'), 'QualityPage'),
  Reporting: page(() => import('@/features/reporting/ReportingPage'), 'ReportingPage'),
  BI: page(() => import('@/features/analytics/BIPage'), 'BIPage'),
  // Administration
  AdminDashboard: page(() => import('@/features/admin/AdminDashboardPage'), 'AdminDashboardPage'),
  AdminSchedules: page(() => import('@/features/planning/SchedulesPage'), 'SchedulesPage'),
  AdminMeetings: page(() => import('@/features/meetings/pages/MeetingsAdminPage'), 'MeetingsAdminPage'),
  AdminAgenda: page(() => import('@/features/meetings/pages/AgendaAdminPage'), 'AgendaAdminPage'),
  AdminRoutines: page(() => import('@/features/routines/pages/RoutineTemplatesPage'), 'RoutineTemplatesPage'),
  AdminChecklists: page(() => import('@/features/checklists/ChecklistsPage'), 'ChecklistsPage'),
  AdminSequences: page(() => import('@/features/sequences/pages/SequencesAdminPage'), 'SequencesAdminPage'),
  AdminKnowledge: page(() => import('@/features/knowledge/pages/KnowledgeAdminPage'), 'KnowledgeAdminPage'),
  AdminUsers: page(() => import('@/features/admin/UsersPage'), 'UsersPage'),
  AdminTeams: page(() => import('@/features/admin/TeamsPage'), 'TeamsPage'),
  AdminStations: page(() => import('@/features/admin/WorkstationsPage'), 'WorkstationsPage'),
  AdminRoles: page(() => import('@/features/admin/RolesPage'), 'RolesPage'),
  AdminSettings: page(() => import('@/features/admin/SettingsPage'), 'SettingsPage'),
  AdminAudit: page(() => import('@/features/admin/AuditLogPage'), 'AuditLogPage'),
  AdminCatalog: page(() => import('@/features/admin/CatalogPage'), 'CatalogPage'),
  AdminSector: page(() => import('@/features/admin/SectorPage'), 'SectorPage'),
  AdminErrors: page(() => import('@/features/telemetry/ErrorsPage'), 'ErrorsPage'),
  AdminUsage: page(() => import('@/features/telemetry/UsagePage'), 'UsagePage'),
  AdminIntegration: page(() => import('@/features/admin/IntegrationPage'), 'IntegrationPage'),
};

function guarded(Component: ComponentType, permission?: Permission, what?: string) {
  return (
    <RequirePermission permission={permission} what={what}>
      <Component />
    </RequirePermission>
  );
}

/** Espace : garde commune à toutes ses pages. */
function space(path: string, permission: Permission, what: string, children: RouteObject[]): RouteObject {
  return {
    path,
    element: (
      <RequirePermission permission={permission} what={what}>
        <Outlet />
      </RequirePermission>
    ),
    children,
  };
}

const legacy = (from: string, to: string): RouteObject => ({ path: from, element: <LegacyRedirect to={to} /> });

/** Table des routes, partagée par l'application (routeur hash) et les tests (routeur mémoire). */
export const appRoutes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/connexion', element: <LegacyRedirect to="/login" /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomeRedirect /> },

      space('app', 'space.app', 'votre espace de travail', [
        { index: true, element: guarded(P.UserDashboard) },
        { path: 'planning', element: guarded(P.MyPlanning) },
        { path: 'routines', element: guarded(P.MyRoutines, 'routine.execute', 'vos routines') },
        { path: 'routines/:scheduleId/:date', element: guarded(P.RoutineRun, 'space.app', 'cette routine') },
        { path: 'routines/:scheduleId/:date/:slot', element: guarded(P.RoutineRun, 'space.app', 'cette routine') },
        { path: 'reunions', element: guarded(P.MyMeetings, 'meeting.view', 'vos réunions') },
        { path: 'actions', element: guarded(P.Actions, 'action.update', 'vos actions') },
        { path: 'sequences', element: guarded(P.Sequences, 'sequence.run', 'les séquences guidées') },
        { path: 'passation', element: guarded(P.Handover) },
        { path: 'connaissances', element: guarded(P.Knowledge) },
      ]),

      space('manager', 'space.supervision', 'la supervision', [
        { index: true, element: guarded(P.ManagerDashboard) },
        { path: 'equipe', element: guarded(P.Team, 'team.updateStatus', 'le suivi de l’équipe') },
        { path: 'routines', element: guarded(P.RoutineMonitor, 'routine.supervise', 'le suivi des routines') },
        { path: 'production', element: guarded(P.Production, 'production.view', 'la production') },
        { path: 'atelier', element: guarded(P.PlantMap, 'production.view', 'le plan de l’atelier') },
        { path: 'anomalies', element: guarded(P.Anomalies, 'anomaly.manage', 'le traitement des anomalies') },
        { path: 'actions', element: guarded(P.Actions, 'action.manage', 'le suivi des actions correctives') },
        { path: 'gemba', element: guarded(P.Gemba, 'gemba.conduct', 'les Gemba Walks') },
        { path: 'gemba/nouvelle', element: guarded(P.GembaNew, 'gemba.conduct', 'la conduite d’une Gemba Walk') },
        { path: 'qualite', element: guarded(P.Quality, 'quality.record', 'les contrôles LQC') },
        { path: 'reporting', element: guarded(P.Reporting, 'reporting.view', 'le reporting') },
        { path: 'bi', element: guarded(P.BI, 'reporting.view', 'les tableaux BI') },
      ]),

      space('admin', 'space.admin', 'l’administration', [
        { index: true, element: <LegacyRedirect to="/admin/dashboard" /> },
        { path: 'dashboard', element: guarded(P.AdminDashboard, 'settings.manage', 'le tableau de bord d’administration') },
        { path: 'planification', element: guarded(P.AdminSchedules, 'schedule.manage', 'la planification') },
        { path: 'reunions', element: guarded(P.AdminMeetings, 'meeting.manage', 'la gestion des réunions') },
        { path: 'agenda', element: guarded(P.AdminAgenda, 'agenda.manage', 'la gestion de l’agenda') },
        { path: 'routines', element: guarded(P.AdminRoutines, 'routine.manage', 'la gestion des routines') },
        { path: 'checklists', element: guarded(P.AdminChecklists, 'checklist.manage', 'la gestion des checklists') },
        { path: 'sequences', element: guarded(P.AdminSequences, 'sequence.manage', 'la gestion des séquences') },
        { path: 'connaissances', element: guarded(P.AdminKnowledge, 'knowledge.manage', 'la gestion du centre de connaissances') },
        { path: 'utilisateurs', element: guarded(P.AdminUsers, 'user.manage', 'la gestion des utilisateurs') },
        { path: 'equipes', element: guarded(P.AdminTeams, 'team.manage', 'la gestion des équipes') },
        { path: 'postes', element: guarded(P.AdminStations, 'workstation.manage', 'la gestion des postes') },
        { path: 'roles', element: guarded(P.AdminRoles, 'settings.manage', 'les rôles et droits') },
        { path: 'parametres', element: guarded(P.AdminSettings, 'settings.manage', 'les paramètres') },
        { path: 'referentiels', element: guarded(P.AdminCatalog, 'settings.manage', 'les référentiels du site') },
        { path: 'modele-secteur', element: guarded(P.AdminSector, 'settings.manage', 'le modèle de secteur') },
        { path: 'journal', element: guarded(P.AdminAudit, 'settings.manage', 'le journal d’audit') },
        { path: 'erreurs', element: guarded(P.AdminErrors, 'settings.manage', 'le suivi des erreurs') },
        { path: 'usage', element: guarded(P.AdminUsage, 'settings.manage', 'la fréquentation des écrans') },
        { path: 'integration', element: guarded(P.AdminIntegration, 'settings.manage', 'l’intégration ERP') },
      ]),

      // Écrans de détail communs : le contenu s'adapte aux droits
      { path: 'andon', element: guarded(P.Andon) },
      { path: 'andon/:id', element: guarded(P.AndonDetail) },
      { path: 'actions/:id', element: guarded(P.ActionDetail) },
      { path: 'anomalies/:id', element: guarded(P.AnomalyDetail) },
      { path: 'reunions/:id', element: guarded(P.Meeting) },
      { path: 'connaissances/:id', element: guarded(P.KnowledgeDetail) },
      { path: 'gemba/:id', element: guarded(P.GembaDetail) },
      { path: 'sequences/execution/:runId', element: guarded(P.SequenceRun, 'sequence.run', 'cette séquence') },
      { path: 'processus', element: guarded(P.ProcessMap) },
      { path: 'signaler', element: guarded(P.ReportAnomaly, 'anomaly.create', 'la déclaration d’anomalie') },

      // Anciennes adresses
      legacy('routines', '/app/routines'),
      legacy('routines/modeles', '/admin/routines'),
      legacy('routines/:templateId/:date', '/app/routines'),
      legacy('actions', '/app/actions'),
      legacy('agenda', '/app/planning'),
      legacy('passation', '/app/passation'),
      legacy('equipe', '/manager/equipe'),
      legacy('production', '/manager/production'),
      legacy('atelier', '/manager/atelier'),
      legacy('sequences', '/app/sequences'),
      legacy('anomalies', '/manager/anomalies'),
      legacy('gemba', '/manager/gemba'),
      legacy('gemba/nouvelle', '/manager/gemba/nouvelle'),
      legacy('qualite', '/manager/qualite'),
      legacy('reporting', '/manager/reporting'),
      legacy('bi', '/manager/bi'),
      legacy('connaissances', '/app/connaissances'),

      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createAppRouter() {
  return createHashRouter(appRoutes);
}

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { createHashRouter, type RouteObject } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/features/auth/LoginPage';
import type { Permission } from '@/services/auth/permissions';
import { RequireAuth, RequirePermission } from './guards';
import { NotFoundPage, RouteErrorPage } from './RouteErrorPage';

/* Table des routes. Chaque page est chargée à la demande et protégée par sa permission. */

function page<M extends Record<string, unknown>>(loader: () => Promise<M>, name: keyof M): LazyExoticComponent<ComponentType> {
  return lazy(async () => ({ default: (await loader())[name] as ComponentType }));
}

const P = {
  Dashboard: page(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage'),
  Routines: page(() => import('@/features/routines/pages/RoutinesPage'), 'RoutinesPage'),
  RoutineRun: page(() => import('@/features/routines/pages/RoutineRunPage'), 'RoutineRunPage'),
  RoutineTemplates: page(() => import('@/features/routines/pages/RoutineTemplatesPage'), 'RoutineTemplatesPage'),
  Actions: page(() => import('@/features/actions/pages/ActionsPage'), 'ActionsPage'),
  ActionDetail: page(() => import('@/features/actions/pages/ActionDetailPage'), 'ActionDetailPage'),
  Agenda: page(() => import('@/features/meetings/pages/AgendaPage'), 'AgendaPage'),
  Meeting: page(() => import('@/features/meetings/pages/MeetingPage'), 'MeetingPage'),
  Handover: page(() => import('@/features/team/pages/HandoverPage'), 'HandoverPage'),
  Team: page(() => import('@/features/team/pages/TeamPage'), 'TeamPage'),
  Andon: page(() => import('@/features/andon/pages/AndonPage'), 'AndonPage'),
  Production: page(() => import('@/features/production/pages/ProductionPage'), 'ProductionPage'),
  PlantMap: page(() => import('@/features/plant/PlantMapPage'), 'PlantMapPage'),
  Sequences: page(() => import('@/features/sequences/pages/SequencesPage'), 'SequencesPage'),
  SequenceRun: page(() => import('@/features/sequences/pages/SequenceRunPage'), 'SequenceRunPage'),
  Anomalies: page(() => import('@/features/anomalies/pages/AnomaliesPage'), 'AnomaliesPage'),
  AnomalyDetail: page(() => import('@/features/anomalies/pages/AnomalyDetailPage'), 'AnomalyDetailPage'),
  ReportAnomaly: page(() => import('@/features/anomalies/pages/ReportAnomalyPage'), 'ReportAnomalyPage'),
  Gemba: page(() => import('@/features/gemba/pages/GembaListPage'), 'GembaListPage'),
  GembaNew: page(() => import('@/features/gemba/pages/GembaFormPage'), 'GembaFormPage'),
  GembaDetail: page(() => import('@/features/gemba/pages/GembaDetailPage'), 'GembaDetailPage'),
  Quality: page(() => import('@/features/quality/QualityPage'), 'QualityPage'),
  Reporting: page(() => import('@/features/reporting/ReportingPage'), 'ReportingPage'),
  BI: page(() => import('@/features/analytics/BIPage'), 'BIPage'),
  Knowledge: page(() => import('@/features/knowledge/pages/KnowledgePage'), 'KnowledgePage'),
  KnowledgeDetail: page(() => import('@/features/knowledge/pages/KnowledgeDetailPage'), 'KnowledgeDetailPage'),
  AdminUsers: page(() => import('@/features/admin/UsersPage'), 'UsersPage'),
  AdminRoles: page(() => import('@/features/admin/RolesPage'), 'RolesPage'),
  AdminStations: page(() => import('@/features/admin/WorkstationsPage'), 'WorkstationsPage'),
  AdminSettings: page(() => import('@/features/admin/SettingsPage'), 'SettingsPage'),
};

function guarded(Component: ComponentType, permission?: Permission, what?: string) {
  return (
    <RequirePermission permission={permission} what={what}>
      <Component />
    </RequirePermission>
  );
}

/** Table des routes, partagée par l'application (routeur hash) et les tests (routeur mémoire). */
export const appRoutes: RouteObject[] = [
    { path: '/connexion', element: <LoginPage /> },
    {
      path: '/',
      element: (
        <RequireAuth>
          <AppShell />
        </RequireAuth>
      ),
      errorElement: <RouteErrorPage />,
      children: [
        { index: true, element: guarded(P.Dashboard) },
        { path: 'routines', element: guarded(P.Routines, 'routine.execute', 'vos routines') },
        { path: 'routines/modeles', element: guarded(P.RoutineTemplates, 'routine.manage', 'la gestion des modèles de routines') },
        { path: 'routines/:templateId/:date', element: guarded(P.RoutineRun, 'routine.execute', 'cette routine') },
        { path: 'actions', element: guarded(P.Actions) },
        { path: 'actions/:id', element: guarded(P.ActionDetail) },
        { path: 'agenda', element: guarded(P.Agenda) },
        { path: 'reunions/:id', element: guarded(P.Meeting) },
        { path: 'passation', element: guarded(P.Handover) },
        { path: 'equipe', element: guarded(P.Team) },
        { path: 'andon', element: guarded(P.Andon) },
        { path: 'production', element: guarded(P.Production) },
        { path: 'atelier', element: guarded(P.PlantMap) },
        { path: 'sequences', element: guarded(P.Sequences, 'sequence.run', 'les séquences guidées') },
        { path: 'sequences/execution/:runId', element: guarded(P.SequenceRun, 'sequence.run', 'cette séquence') },
        { path: 'anomalies', element: guarded(P.Anomalies) },
        { path: 'anomalies/:id', element: guarded(P.AnomalyDetail) },
        { path: 'signaler', element: guarded(P.ReportAnomaly, 'anomaly.create', 'la déclaration d’anomalie') },
        { path: 'gemba', element: guarded(P.Gemba) },
        { path: 'gemba/nouvelle', element: guarded(P.GembaNew, 'gemba.conduct', 'la conduite d’une Gemba Walk') },
        { path: 'gemba/:id', element: guarded(P.GembaDetail) },
        { path: 'qualite', element: guarded(P.Quality) },
        { path: 'reporting', element: guarded(P.Reporting, 'reporting.view', 'le reporting') },
        { path: 'bi', element: guarded(P.BI, 'reporting.view', 'les tableaux BI') },
        { path: 'connaissances', element: guarded(P.Knowledge) },
        { path: 'connaissances/:id', element: guarded(P.KnowledgeDetail) },
        { path: 'admin/utilisateurs', element: guarded(P.AdminUsers, 'admin.access', 'l’administration') },
        { path: 'admin/roles', element: guarded(P.AdminRoles, 'admin.access', 'l’administration') },
        { path: 'admin/postes', element: guarded(P.AdminStations, 'admin.access', 'l’administration') },
        { path: 'admin/parametres', element: guarded(P.AdminSettings, 'admin.access', 'l’administration') },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
];

export function createAppRouter() {
  return createHashRouter(appRoutes);
}

import { useQuery } from '@tanstack/react-query';
import { useDataSource } from '@/app/providers/DataSourceProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { useLookups } from '@/features/shared/api';
import type { AuditEntry } from '@/services/data/types';
import { formatDateTime } from '@/utils/date';

const LIMIT = 500;

const EVENT_LABELS: Record<string, string> = {
  USER_LOGIN: 'Connexion',
  USER_LOGOUT: 'Déconnexion',
  USER_CREATED: 'Compte créé',
  USER_UPDATED: 'Compte modifié',
  USER_ROLE_CHANGED: 'Rôle modifié',
  USER_DEACTIVATED: 'Compte désactivé',
  USER_REACTIVATED: 'Compte réactivé',
  USER_PASSWORD_RESET: 'Mot de passe réinitialisé',
  PERMISSION_DENIED: 'Accès refusé',
  SETTINGS_CHANGED: 'Paramètres modifiés',
  DEMO_ENVIRONMENT_RESET: 'Environnement réinitialisé',
  ROUTINE_CREATED: 'Routine créée',
  ROUTINE_UPDATED: 'Routine modifiée',
  ROUTINE_ARCHIVED: 'Routine archivée',
  ROUTINE_STARTED: 'Routine démarrée',
  ROUTINE_COMPLETED: 'Routine terminée',
  SCHEDULE_CREATED: 'Planification créée',
  SCHEDULE_UPDATED: 'Planification modifiée',
  SCHEDULE_CANCELLED: 'Planification annulée',
  CHECKLIST_CREATED: 'Checklist créée',
  CHECKLIST_UPDATED: 'Checklist modifiée',
  DOCUMENT_CREATED: 'Document créé',
  DOCUMENT_UPDATED: 'Document modifié',
  MEETING_CREATED: 'Réunion créée',
  MEETING_UPDATED: 'Réunion modifiée',
  MEETING_DELETED: 'Réunion supprimée',
  ANDON_CREATED: 'Andon déclenché',
  ANDON_ACKNOWLEDGED: 'Andon pris en charge',
  ANDON_IN_PROGRESS: 'Andon en résolution',
  ANDON_RESOLVED: 'Andon résolu',
  ANOMALY_CREATED: 'Anomalie déclarée',
  ANOMALY_UPDATED: 'Anomalie mise à jour',
  CORRECTIVE_ACTION_CREATED: 'Action corrective créée',
  CORRECTIVE_ACTION_UPDATED: 'Action corrective mise à jour',
};

/** Journal d'audit : écrit uniquement par le serveur, consultable par l'administration, jamais modifiable. */
export function AuditLogPage() {
  const ds = useDataSource();
  const { lookups } = useLookups();
  const query = useQuery({
    queryKey: ['auditLog', LIMIT],
    queryFn: () => ds.auditLog!(LIMIT),
    enabled: Boolean(ds.auditLog),
  });

  const actor = (e: AuditEntry) => (e.actorId ? (lookups?.userById.get(e.actorId)?.name ?? e.actorId) : 'Système / anonyme');
  const columns: Column<AuditEntry>[] = [
    { id: 'at', header: 'Date', mobile: 'aside', cell: (e) => formatDateTime(e.at), sortValue: (e) => e.at },
    { id: 'event', header: 'Événement', mobile: 'title', cell: (e) => EVENT_LABELS[e.event] ?? e.event, sortValue: (e) => e.event },
    { id: 'actor', header: 'Auteur', mobile: 'meta', cell: actor, sortValue: actor },
    { id: 'resource', header: 'Objet', mobile: 'meta', cell: (e) => `${e.resource}${e.resourceId ? ` · ${e.resourceId}` : ''}` },
    {
      id: 'detail',
      header: 'Détail',
      mobile: 'hidden',
      cell: (e) => (Object.keys(e.detail ?? {}).length ? JSON.stringify(e.detail).slice(0, 160) : '—'),
    },
  ];

  return (
    <>
      <PageHeader
        title="Journal d’audit"
        description={`Connexions, refus d’accès et opérations sensibles, enregistrés par le serveur. Lecture seule — ${LIMIT} derniers événements.`}
      />
      {!ds.auditLog ? (
        <EmptyState
          title="Journal indisponible en mode démonstration locale"
          description="Le journal d’audit est tenu par le serveur : il n’existe pas quand les données sont stockées dans le navigateur."
        />
      ) : (
        <QueryBoundary queries={[query]}>
          {() => (
            <Panel flush>
              <DataTable
                caption="Journal d’audit"
                rows={query.data ?? []}
                columns={columns}
                rowKey={(e) => e.id}
                initialSort={{ id: 'at', direction: 'desc' }}
                search={{
                  placeholder: 'Rechercher un événement, une personne…',
                  text: (e) => `${EVENT_LABELS[e.event] ?? e.event} ${actor(e)} ${e.resource} ${e.resourceId ?? ''}`,
                }}
                empty={{ title: 'Aucun événement.' }}
              />
            </Panel>
          )}
        </QueryBoundary>
      )}
    </>
  );
}

import { isRouteErrorResponse, useRouteError } from 'react-router';
import { EmptyState } from '@/components/feedback/States';
import { ButtonLink } from '@/components/ui/Button';
import { createLogger } from '@/services/logger';

const log = createLogger('router');

/** Erreur de rendu inattendue : message compréhensible, détail dans le journal. */
export function RouteErrorPage() {
  const error = useRouteError();
  log.error('Erreur de rendu', error);
  const isChunkError = error instanceof Error && /dynamically imported module|Failed to fetch/i.test(error.message);
  return (
    <div style={{ padding: 'var(--space-8) var(--space-4)' }}>
      <EmptyState
        title={isRouteErrorResponse(error) && error.status === 404 ? 'Page introuvable' : 'Cet écran n’a pas pu s’afficher'}
        description={
          isChunkError
            ? 'Une nouvelle version de l’application est peut-être disponible. Rechargez la page.'
            : 'L’erreur a été enregistrée dans le journal. Revenez à l’accueil ou rechargez la page.'
        }
        action={<ButtonLink to="/" variant="primary">Retour à l’accueil</ButtonLink>}
      />
    </div>
  );
}

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page introuvable"
      description="Le lien est peut-être incorrect ou la page a été déplacée."
      action={<ButtonLink to="/" variant="primary">Retour à l’accueil</ButtonLink>}
    />
  );
}

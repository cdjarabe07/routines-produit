import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { CircleAlert, Inbox, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toUserMessage } from '@/services/errors';
import { cx } from '@/utils/cx';
import styles from './States.module.css';

export function LoadingState({ label = 'Chargement…', compact }: { label?: string; compact?: boolean }) {
  return (
    <div className={cx(styles.state, compact && styles.compact)} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden />
      <span>{label}</span>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
}

/** Jamais de liste vide sans explication. */
export function EmptyState({ title, description, action, icon, compact }: EmptyStateProps) {
  return (
    <div className={cx(styles.state, compact && styles.compact)}>
      {!compact && (
        <span className={styles.icon} aria-hidden>
          {icon ?? <Inbox size={28} />}
        </span>
      )}
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  return (
    <div className={cx(styles.state, styles.error, compact && styles.compact)} role="alert">
      {!compact && (
        <span className={styles.icon} aria-hidden>
          <CircleAlert size={28} />
        </span>
      )}
      <p className={styles.title}>Impossible d’afficher ces informations</p>
      <p className={styles.description}>{toUserMessage(error)}</p>
      {onRetry && (
        <div className={styles.action}>
          <Button size="sm" onClick={onRetry}>
            Réessayer
          </Button>
        </div>
      )}
    </div>
  );
}

export function AccessDenied({ what = 'cette page' }: { what?: string }) {
  return (
    <div className={styles.state}>
      <span className={styles.icon} aria-hidden>
        <Lock size={28} />
      </span>
      <p className={styles.title}>Accès non autorisé</p>
      <p className={styles.description}>
        Votre rôle ne permet pas d’accéder à {what}. Si vous en avez besoin, demandez à un administrateur de modifier votre rôle.
      </p>
    </div>
  );
}

type Queries = UseQueryResult<unknown>[];

/**
 * Normalise chargement / erreur pour une ou plusieurs requêtes.
 * Les données sont disponibles dans children une fois toutes les requêtes résolues.
 */
export function QueryBoundary({
  queries,
  children,
  compact,
  loadingLabel,
}: {
  queries: Queries;
  children: () => ReactNode;
  compact?: boolean;
  loadingLabel?: string;
}) {
  const failed = queries.find((q) => q.isError);
  if (failed) return <ErrorState error={failed.error} onRetry={() => queries.forEach((q) => q.isError && q.refetch())} compact={compact} />;
  if (queries.some((q) => q.isPending)) return <LoadingState compact={compact} label={loadingLabel} />;
  return <>{children()}</>;
}

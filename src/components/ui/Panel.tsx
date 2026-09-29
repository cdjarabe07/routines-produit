import type { ReactNode } from 'react';
import { cx } from '@/utils/cx';
import styles from './Panel.module.css';

interface PanelProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Bordure d'accent à gauche pour signaler un état (ex. danger) */
  accent?: 'danger' | 'warning' | 'info' | 'success';
  /** Contenu collé aux bords (tableaux, listes) */
  flush?: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
}

/** Zone de contenu bordée avec en-tête optionnel. Préférer les sections sans cadre quand c'est possible. */
export function Panel({ title, description, actions, accent, flush, children, className, id }: PanelProps) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section className={cx(styles.panel, accent && styles[accent], className)} aria-labelledby={title ? headingId : undefined} id={id}>
      {(title || actions) && (
        <header className={styles.header}>
          <div className={styles.titles}>
            {title && <h2 id={headingId} className={styles.title}>{title}</h2>}
            {description && <p className={styles.description}>{description}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      <div className={cx(styles.body, flush && styles.flush)}>{children}</div>
    </section>
  );
}

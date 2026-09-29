import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  meta?: ReactNode;
}

export function PageHeader({ title, description, actions, back, meta }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {back && (
          <Link to={back.to} className={styles.back}>
            <ChevronLeft size={16} aria-hidden />
            {back.label}
          </Link>
        )}
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
        {meta && <div className={styles.meta}>{meta}</div>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}

/** Pile verticale standard entre les blocs d'une page. */
export function Stack({ children, gap = 5 }: { children: ReactNode; gap?: 3 | 4 | 5 | 6 }) {
  return <div className={styles[`stack${gap}`]}>{children}</div>;
}

/** Deux colonnes sur grand écran (principal + latéral), une seule sur tablette/mobile. */
export function Columns({
  children,
  ratio = 'main-side',
  sideFirstOnMobile,
}: {
  children: ReactNode;
  ratio?: 'main-side' | 'equal';
  sideFirstOnMobile?: boolean;
}) {
  return (
    <div className={`${ratio === 'equal' ? styles.columnsEqual : styles.columns} ${sideFirstOnMobile ? styles.sideFirst : ''}`}>
      {children}
    </div>
  );
}

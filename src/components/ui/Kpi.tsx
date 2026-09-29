import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from '@/utils/cx';
import styles from './Kpi.module.css';

interface KpiProps {
  label: string;
  value: ReactNode;
  /** Précision : dénominateur, période, définition */
  detail?: ReactNode;
  /** Le ton ne s'applique qu'à la valeur, et seulement si elle signale un état */
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  /** Variation vs période précédente (déjà formatée), et sens favorable */
  delta?: { text: string; favorable: boolean | null };
  to?: string;
}

export function Kpi({ label, value, detail, tone = 'neutral', delta, to }: KpiProps) {
  const content = (
    <>
      <span className={styles.label}>{label}</span>
      <span className={cx(styles.value, styles[tone])}>{value}</span>
      {(detail || delta) && (
        <span className={styles.detail}>
          {delta && (
            <span className={cx(styles.delta, delta.favorable === true && styles.up, delta.favorable === false && styles.down)}>
              {delta.text}
            </span>
          )}
          {detail}
        </span>
      )}
    </>
  );
  return to ? (
    <Link to={to} className={cx(styles.kpi, styles.link)}>
      {content}
    </Link>
  ) : (
    <div className={styles.kpi}>{content}</div>
  );
}

/** Rangée d'indicateurs séparés par des filets (pas de cartes empilées). */
export function KpiStrip({ children }: { children: ReactNode }) {
  return <div className={styles.strip}>{children}</div>;
}

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Info } from 'lucide-react';
import { cx } from '@/utils/cx';
import { Tooltip } from './Tooltip';
import styles from './Kpi.module.css';

interface KpiProps {
  label: string;
  value: ReactNode;
  /** Précision : dénominateur, période */
  detail?: ReactNode;
  /** Définition de l'indicateur, affichée dans une info-bulle (docs/functional-spec.md §7) */
  definition?: string;
  /** Le ton ne s'applique qu'à la valeur, et seulement si elle signale un état */
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  /** Variation vs période précédente (déjà formatée), et sens favorable */
  delta?: { text: string; favorable: boolean | null };
  to?: string;
}

export function Kpi({ label, value, detail, definition, tone = 'neutral', delta, to }: KpiProps) {
  const valueNode = <span className={cx(styles.value, styles[tone])}>{value}</span>;
  return (
    <div className={cx(styles.kpi, to && styles.link)}>
      <span className={styles.labelRow}>
        <span className={styles.label}>{label}</span>
        {definition && (
          <Tooltip content={definition}>
            <button type="button" className={styles.info} aria-label={`Définition : ${label}`}>
              <Info size={13} aria-hidden />
            </button>
          </Tooltip>
        )}
      </span>
      {to ? (
        <Link to={to} className={styles.valueLink} aria-label={`${label} : voir le détail`}>
          {valueNode}
        </Link>
      ) : (
        valueNode
      )}
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
    </div>
  );
}

/** Rangée d'indicateurs séparés par des filets (pas de cartes empilées). */
export function KpiStrip({ children }: { children: ReactNode }) {
  return <div className={styles.strip}>{children}</div>;
}

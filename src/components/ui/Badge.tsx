import type { ReactNode } from 'react';
import { cx } from '@/utils/cx';
import styles from './Badge.module.css';

/** Tons à sens métier : success = OK, warning = attention, danger = critique, info = en cours, neutral = sans état. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'demo';

export function Badge({ tone = 'neutral', children, strong, className }: { tone?: Tone; children: ReactNode; strong?: boolean; className?: string }) {
  return <span className={cx(styles.badge, styles[tone], strong && styles.strong, className)}>{children}</span>;
}

/** Pastille d'état + libellé (la couleur n'est jamais le seul porteur d'information). */
export function StatusDot({ tone, label, pulse }: { tone: Tone; label: string; pulse?: boolean }) {
  return (
    <span className={styles.status}>
      <span className={cx(styles.dot, styles[`dot-${tone}`], pulse && styles.pulse)} aria-hidden />
      {label}
    </span>
  );
}

import { cx } from '@/utils/cx';
import styles from './Progress.module.css';

interface ProgressProps {
  value: number;
  max?: number;
  label: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
  showValue?: boolean;
  size?: 'sm' | 'md';
}

export function Progress({ value, max = 100, label, tone = 'info', showValue, size = 'md' }: ProgressProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={styles.wrap}>
      <div
        className={cx(styles.track, styles[size])}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className={cx(styles.bar, styles[tone])} style={{ width: `${pct}%` }} />
      </div>
      {showValue && <span className={styles.value}>{Math.round(pct)} %</span>}
    </div>
  );
}

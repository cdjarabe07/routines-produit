import { Link } from 'react-router';
import { cx } from '@/utils/cx';
import type { LineStatus } from '../model';
import styles from './LineStatusStrip.module.css';

const STATE = {
  stopped: { label: 'Andon en attente', className: styles.stopped },
  degraded: { label: 'Perturbée', className: styles.degraded },
  running: { label: 'Nominale', className: styles.running },
};

/** Bandeau d'état atelier : une cellule par ligne, lisible d'un coup d'œil. */
export function LineStatusStrip({ statuses, criticalAnomalies }: { statuses: LineStatus[]; criticalAnomalies: number }) {
  return (
    <div className={styles.strip} role="list" aria-label="État des lignes">
      {statuses.map((s) => (
        <Link key={s.line.id} to="/andon" role="listitem" className={cx(styles.cell, STATE[s.state].className)}>
          <span className={styles.name}>{s.line.name}</span>
          <span className={styles.state}>{STATE[s.state].label}</span>
          <span className={styles.detail}>
            {s.openAndon ? `${s.openAndon} Andon ouvert${s.openAndon > 1 ? 's' : ''}` : 'Aucun Andon'}
            {s.blockedOrders.length > 0 && ` · ${s.blockedOrders.length} OF bloqué`}
            {s.lowStocks > 0 && ` · ${s.lowStocks} stock(s) bas`}
          </span>
        </Link>
      ))}
      <Link to="/manager/anomalies" role="listitem" className={cx(styles.cell, criticalAnomalies ? styles.stopped : styles.running)}>
        <span className={styles.name}>Anomalies critiques</span>
        <span className={styles.state}>
          {criticalAnomalies ? `${criticalAnomalies} ouverte${criticalAnomalies > 1 ? 's' : ''}` : 'Aucune'}
        </span>
        <span className={styles.detail}>Sécurité, qualité client, arrêt</span>
      </Link>
    </div>
  );
}

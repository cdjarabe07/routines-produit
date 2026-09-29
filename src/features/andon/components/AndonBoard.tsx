import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { AndonAlert, Line, Workstation } from '@/types/domain';
import { formatDuration, formatTime } from '@/utils/date';
import { cx } from '@/utils/cx';
import { ANDON_STATUS, ANDON_TYPE, isEscalated, worstOpenAlert } from '../model';
import styles from './AndonBoard.module.css';

interface Props {
  lines: Line[];
  workstations: Workstation[];
  alerts: AndonAlert[];
  now: Date;
  escalationMinutes: number;
  userName: (id?: string) => string;
  canRespond: boolean;
  onAcknowledge?: (alert: AndonAlert) => void;
  onResolve?: (alert: AndonAlert) => void;
  onRaise?: (workstationId: string) => void;
  /** Affichage atelier : fond sombre, gros caractères, sans boutons */
  display?: boolean;
}

/** Tableau Andon : une tuile par poste, l'état se lit à distance (couleur + libellé + chronomètre). */
export function AndonBoard({ lines, workstations, alerts, now, escalationMinutes, userName, canRespond, onAcknowledge, onResolve, onRaise, display }: Props) {
  return (
    <div className={cx(styles.board, display && styles.display)}>
      {lines.map((line) => {
        const stations = workstations.filter((w) => w.lineId === line.id && w.active);
        const lineAlerts = stations.map((s) => worstOpenAlert(alerts, s.id)).filter(Boolean);
        return (
          <section key={line.id} className={styles.line} aria-label={line.name}>
            <header className={styles.lineHead}>
              <h2>{line.name}{line.description ? ` — ${line.description}` : ''}</h2>
              <span className={cx(styles.lineState, lineAlerts.length ? styles.lineAlarm : styles.lineOk)}>
                {lineAlerts.length ? `${lineAlerts.length} Andon en cours` : 'Aucun Andon'}
              </span>
            </header>
            <ul className={styles.tiles}>
              {stations.map((ws) => {
                const alert = worstOpenAlert(alerts, ws.id);
                const escalated = alert ? isEscalated(alert, now, escalationMinutes) : false;
                const state = !alert ? 'ok' : alert.status === 'acknowledged' ? 'ack' : 'active';
                const openCount = alerts.filter((a) => a.workstationId === ws.id && a.status !== 'resolved').length;
                return (
                  <li key={ws.id} className={cx(styles.tile, styles[state], escalated && styles.escalated, alert?.urgency === 'critical' && styles.critical)}>
                    <div className={styles.tileHead}>
                      <span className={styles.code}>{ws.code}</span>
                      <span className={styles.process}>{ws.process}</span>
                    </div>
                    {alert ? (
                      <>
                        <div className={styles.timer} aria-label={`Depuis ${formatDuration(now.getTime() - new Date(alert.raisedAt).getTime())}`}>
                          {formatDuration(now.getTime() - new Date(alert.raisedAt).getTime())}
                        </div>
                        <div className={styles.status}>
                          <strong>{ANDON_TYPE[alert.type].label}</strong>
                          <span>{escalated ? 'ESCALADÉ — personne n’a pris en charge' : ANDON_STATUS[alert.status].label}</span>
                        </div>
                        <p className={styles.detail}>{alert.detail}</p>
                        <p className={styles.meta}>
                          Déclenché à {formatTime(alert.raisedAt)}
                          {alert.acknowledgedBy && ` · ${userName(alert.acknowledgedBy)} intervient`}
                          {openCount > 1 && ` · ${openCount} alertes sur ce poste`}
                        </p>
                        {!display && canRespond && (
                          <div className={styles.buttons}>
                            {alert.status === 'active' && <Button size="sm" className={styles.onAlarm} onClick={() => onAcknowledge?.(alert)}>Je prends en charge</Button>}
                            <Button size="sm" variant="success" onClick={() => onResolve?.(alert)}>Résoudre</Button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className={styles.okLabel}>En marche</div>
                        {!display && onRaise && (
                          <div className={styles.buttons}>
                            <Button size="sm" variant="ghost" onClick={() => onRaise(ws.id)}>Déclencher</Button>
                          </div>
                        )}
                      </>
                    )}
                    {alert?.urgency === 'critical' && <Badge tone="danger" strong className={styles.criticalBadge}>Critique</Badge>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

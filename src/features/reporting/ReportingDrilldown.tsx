import { anomalyCategoryLabel } from '@/app/catalog';
import { ItemList } from '@/components/data-display/ItemList';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Overlay';
import { ANDON_STATUS, ANDON_TYPE } from '@/features/andon/model';
import { OCCURRENCE_STATE, assignmentLabel } from '@/features/planning/model';
import { runSummary } from '@/features/routines/model';
import type { Lookups } from '@/features/shared/api';
import { ANOMALY_STATUS, SEVERITY } from '@/features/shared/labels';
import { formatDate, formatLongDate, formatTime } from '@/utils/date';
import type { Drilldown, DrilldownResult } from './model';
import styles from './ReportingPage.module.css';

interface Props {
  selection: Drilldown;
  result: DrilldownResult;
  lookups: Lookups;
  routineTitle?: string;
  periodLabel: string;
  onClose: () => void;
}

/** Enregistrements derrière la sélection (jour, catégorie, poste ou routine), avec liens vers chaque fiche. */
export function ReportingDrilldown({ selection, result, lookups, routineTitle, periodLabel, onClose }: Props) {
  const title =
    selection.kind === 'day'
      ? `Détail du ${formatLongDate(selection.date)}`
      : selection.kind === 'category'
        ? `Anomalies « ${anomalyCategoryLabel(selection.category)} » — ${periodLabel}`
        : selection.kind === 'station'
          ? `${lookups.workstationName(selection.workstationId)} — ${periodLabel}`
          : `${routineTitle ?? 'Routine'} — ${periodLabel}`;

  const done = result.occurrences.filter((o) => o.state === 'done').length;
  const showRoutines = selection.kind === 'day' || selection.kind === 'routine';
  const showAnomalies = selection.kind !== 'routine';
  const showAlerts = selection.kind === 'day' || selection.kind === 'station';

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title={title}
      description={
        showRoutines
          ? `${result.occurrences.length} routine(s) programmée(s), ${done} terminée(s)`
          : `${result.anomalies.length} anomalie(s)${showAlerts ? `, ${result.alerts.length} Andon` : ''}`
      }
    >
      <div className={styles.drillGrid}>
        {showRoutines && (
          <section aria-label="Routines">
            <h3 className={styles.drillTitle}>Routines</h3>
            <ItemList
              items={result.occurrences.map((o) => {
                const s = runSummary(o.routine, new Map(), o.run);
                return {
                  id: o.key,
                  title: selection.kind === 'routine' ? `${formatDate(o.date)} · ${o.time}` : `${o.time} · ${o.routine.title}`,
                  meta: [
                    o.run ? `par ${lookups.userName(o.run.assigneeId)}` : assignmentLabel(o.schedule, lookups.userName, lookups.teamName),
                    s.durationMin !== null ? `${s.durationMin} min` : null,
                    s.ko ? `${s.ko} non-conformité(s)` : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  aside: <Badge tone={OCCURRENCE_STATE[o.state].tone}>{OCCURRENCE_STATE[o.state].label}</Badge>,
                  to: `/app/routines/${o.schedule.id}/${o.date}`,
                  tone: o.state === 'late' || o.state === 'missed' ? ('danger' as const) : undefined,
                };
              })}
              empty="Aucune routine programmée."
            />
          </section>
        )}
        {showAnomalies && (
          <section aria-label="Anomalies">
            <h3 className={styles.drillTitle}>Anomalies</h3>
            <ItemList
              items={result.anomalies.map((a) => ({
                id: a.id,
                title: a.description,
                meta: `${formatDate(a.createdAt)} ${formatTime(a.createdAt)} · ${lookups.workstationName(a.workstationId)} · ${SEVERITY[a.severity].label}`,
                aside: <Badge tone={ANOMALY_STATUS[a.status].tone}>{ANOMALY_STATUS[a.status].label}</Badge>,
                to: `/anomalies/${a.id}`,
              }))}
              empty="Aucune anomalie."
            />
          </section>
        )}
        {showAlerts && (
          <section aria-label="Andon">
            <h3 className={styles.drillTitle}>Andon</h3>
            <ItemList
              items={result.alerts.map((a) => ({
                id: a.id,
                title: `${ANDON_TYPE[a.type].label} — ${a.detail}`,
                meta: `${formatDate(a.raisedAt)} ${formatTime(a.raisedAt)} · ${lookups.workstationName(a.workstationId)}`,
                aside: <Badge tone={ANDON_STATUS[a.status].tone}>{ANDON_STATUS[a.status].label}</Badge>,
                to: `/andon/${a.id}`,
              }))}
              empty="Aucun Andon."
            />
          </section>
        )}
        {selection.kind === 'day' && (
          <section aria-label="Actions terminées">
            <h3 className={styles.drillTitle}>Actions terminées</h3>
            <ItemList
              items={result.actionsClosed.map((a) => ({
                id: a.id,
                title: a.title,
                meta: lookups.userName(a.assigneeId),
                to: `/actions/${a.id}`,
              }))}
              empty="Aucune action terminée ce jour-là."
            />
          </section>
        )}
      </div>
    </Drawer>
  );
}

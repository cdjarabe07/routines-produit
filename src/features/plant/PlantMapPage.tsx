import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Cpu } from 'lucide-react';
import { ItemList } from '@/components/data-display/ItemList';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Panel';
import { SEVERITY } from '@/features/shared/labels';
import { useLookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useIsCompact } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { formatDuration } from '@/utils/date';
import { cx } from '@/utils/cx';
import { DATA_ORIGIN, STATION_STATE, stationView, type StationView } from './model';
import styles from './PlantMapPage.module.css';

export function PlantMapPage() {
  const compact = useIsCompact();
  const now = useNow(5000);
  const alerts = useCollection('andonAlerts');
  const stocks = useCollection('materialStocks');
  const anomalies = useCollection('anomalies');
  const { queries, lookups } = useLookups();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const views = useMemo(
    () =>
      lookups && alerts.data && stocks.data && anomalies.data
        ? lookups.workstations.filter((w) => w.active).map((w) => stationView(w, alerts.data!, stocks.data!, anomalies.data!))
        : [],
    [lookups, alerts.data, stocks.data, anomalies.data],
  );
  const selected = views.find((v) => v.station.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Plan atelier"
        description="Vue d’ensemble des postes. L’état de chaque poste est calculé à partir des Andon, stocks et anomalies saisis dans l’application."
        meta={<Badge tone="neutral">Données machine : non connectées</Badge>}
      />
      <QueryBoundary queries={[alerts, stocks, anomalies, ...queries]}>
        {() => (
          <Columns>
            <Stack gap={4}>
              <Legend />
              {compact ? (
                <StationList views={views} lines={lookups!.lines} selectedId={selectedId} onSelect={setSelectedId} />
              ) : (
                <div className={styles.floor} role="group" aria-label="Plan de l’atelier">
                  {lookups!.lines.map((line, i) => (
                    <div key={line.id} className={styles.band} style={{ top: `${i === 0 ? 8 : 52}%` }} aria-hidden>
                      <span>
                        {line.name}
                        {line.description ? ` — ${line.description}` : ''}
                      </span>
                    </div>
                  ))}
                  {views.map((v) => (
                    <button
                      key={v.station.id}
                      type="button"
                      className={cx(styles.node, styles[v.state], selectedId === v.station.id && styles.selected)}
                      style={{ left: `${v.station.mapX}%`, top: `${v.station.mapY}%` }}
                      onClick={() => setSelectedId(v.station.id)}
                      aria-pressed={selectedId === v.station.id}
                      aria-label={`${v.station.name} — ${STATION_STATE[v.state].label}`}
                    >
                      <span className={styles.nodeCode}>{v.station.code}</span>
                      <span className={styles.nodeProcess}>{v.station.process}</span>
                      <span className={styles.nodeState}>{STATION_STATE[v.state].label}</span>
                      {v.alert && (
                        <span className={styles.nodeTimer}>{formatDuration(now.getTime() - new Date(v.alert.raisedAt).getTime())}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <Panel title="Données machine" description="Cadence, états automates, températures, compteurs.">
                <div className={styles.notConnected}>
                  <Cpu size={22} aria-hidden />
                  <p>
                    Aucune source de données machine n’est connectée. Le plan n’affiche donc que des états calculés à partir des saisies. Le
                    branchement d’un MES ou d’un collecteur automate est décrit dans <code>docs/deployment.md</code>.
                  </p>
                </div>
              </Panel>
            </Stack>
            <StationDetail view={selected} />
          </Columns>
        )}
      </QueryBoundary>
    </>
  );
}

function Legend() {
  return (
    <div className={styles.legend} aria-label="Légende">
      <StatusDot tone="danger" label={STATION_STATE.andon.label} />
      <StatusDot tone="warning" label="Andon pris en charge / à surveiller" />
      <StatusDot tone="success" label={STATION_STATE.ok.label} />
    </div>
  );
}

function StationList({
  views,
  lines,
  selectedId,
  onSelect,
}: {
  views: StationView[];
  lines: { id: string; name: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Stack gap={3}>
      {lines.map((line) => (
        <Panel key={line.id} title={line.name} flush>
          <ul className={styles.list}>
            {views
              .filter((v) => v.station.lineId === line.id)
              .map((v) => (
                <li key={v.station.id}>
                  <button
                    type="button"
                    className={cx(styles.listItem, selectedId === v.station.id && styles.listSelected)}
                    onClick={() => onSelect(v.station.id)}
                    aria-pressed={selectedId === v.station.id}
                  >
                    <strong>{v.station.code}</strong>
                    <span className={styles.listProcess}>{v.station.process}</span>
                    <Badge tone={STATION_STATE[v.state].tone}>{STATION_STATE[v.state].label}</Badge>
                  </button>
                </li>
              ))}
          </ul>
        </Panel>
      ))}
    </Stack>
  );
}

function StationDetail({ view }: { view: StationView | null }) {
  if (!view) {
    return (
      <Panel title="Détail du poste">
        <EmptyState compact title="Sélectionnez un poste sur le plan pour voir ses signaux." />
      </Panel>
    );
  }
  return (
    <Panel
      title={view.station.name}
      description={`État : ${STATION_STATE[view.state].label}`}
      accent={STATION_STATE[view.state].tone === 'danger' ? 'danger' : STATION_STATE[view.state].tone === 'warning' ? 'warning' : 'success'}
    >
      <Stack gap={4}>
        <section>
          <h3 className={styles.subtitle}>Signaux</h3>
          {view.signals.length === 0 ? (
            <p className={styles.muted}>Aucun Andon, stock bas ou anomalie critique sur ce poste.</p>
          ) : (
            <ul className={styles.signals}>
              {view.signals.map((s) => (
                <li key={s.label}>
                  <Badge tone={s.tone}>{s.source}</Badge>
                  <span>{s.label}</span>
                  <span className={styles.origin}>{DATA_ORIGIN[s.origin]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className={styles.subtitle}>Anomalies ouvertes ({view.openAnomalies.length})</h3>
          {view.openAnomalies.length === 0 ? (
            <p className={styles.muted}>Aucune.</p>
          ) : (
            <ItemList
              items={view.openAnomalies.slice(0, 5).map((a) => ({
                id: a.id,
                title: a.description,
                aside: <Badge tone={SEVERITY[a.severity].tone}>{SEVERITY[a.severity].label}</Badge>,
                to: `/anomalies/${a.id}`,
              }))}
            />
          )}
        </section>
        <div className={styles.links}>
          <ButtonLink size="sm" to={`/signaler?poste=${view.station.code}`}>
            Signaler une anomalie
          </ButtonLink>
          <ButtonLink size="sm" to={`/andon?declencher=1&poste=${view.station.id}`} variant="danger">
            Déclencher un Andon
          </ButtonLink>
          <Link to="/production?vue=stocks" className={styles.textLink}>
            Stocks
          </Link>
        </div>
      </Stack>
    </Panel>
  );
}

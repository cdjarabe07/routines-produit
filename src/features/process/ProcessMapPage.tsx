import { stageLabel } from '@/app/catalog';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowDown, ArrowRight, RotateCcw } from 'lucide-react';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import { useModules } from '@/app/modules';
import { useAuth } from '@/app/providers/AuthProvider';
import { usePlanningData } from '@/features/planning/api';
import { occurrencesBetween } from '@/features/planning/model';
import { STATION_STATE } from '@/features/plant/model';
import { useLookups, useSettings } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useNow } from '@/hooks/useNow';
import { dayRange, todayKey } from '@/utils/date';
import { cx } from '@/utils/cx';
import { productionFlow, workMetrics, type LineFlow, type Metric } from './model';
import { PROCESS_STAGES, linkFor } from './nodes';
import styles from './ProcessMapPage.module.css';

type View = 'organisation' | 'fabrication';

const VIEWS = [
  { value: 'organisation', label: 'Organisation du travail' },
  { value: 'fabrication', label: 'Flux de fabrication' },
] as const;

/** Carte du processus : comment le travail s'enchaîne, avec les chiffres du moment. */
export function ProcessMapPage() {
  const [params, setParams] = useSearchParams();
  const flowEnabled = useModules().isEnabled('production');
  const view: View = flowEnabled && params.get('vue') === 'fabrication' ? 'fabrication' : 'organisation';

  return (
    <>
      <PageHeader
        title="Carte du processus"
        description="Comment le travail s’enchaîne dans l’atelier, de la préparation au pilotage. Les chiffres sont ceux d’aujourd’hui, dans votre périmètre."
      />
      {flowEnabled && (
        <div className={styles.tabs}>
          <Tabs
            label="Vue de la carte"
            items={[...VIEWS]}
            value={view}
            onChange={(v) => setParams(v === 'organisation' ? {} : { vue: v }, { replace: true })}
          />
        </div>
      )}
      {view === 'organisation' ? <WorkMap /> : <FlowMap />}
    </>
  );
}

/* ---------- Organisation du travail ---------- */

function WorkMap() {
  const { can } = useAuth();
  const modules = useModules();
  const now = useNow(60_000);
  const today = todayKey();
  const { settings } = useSettings();
  const planning = usePlanningData({ from: today, to: today });
  const meetings = useCollection('meetings', { where: { date: today } });
  const alerts = useCollection('andonAlerts');
  const anomalies = useCollection('anomalies');
  const actions = useCollection('actions');
  const checks = useCollection('qualityChecks', { range: { field: 'createdAt', ...dayRange(today, today) } });

  const metrics = useMemo(() => {
    if (!planning.source || !meetings.data || !alerts.data || !anomalies.data || !actions.data || !checks.data) return null;
    return workMetrics({
      today,
      now,
      toleranceMin: settings.routineLateToleranceMinutes,
      routines: planning.source.routines,
      schedules: planning.source.schedules,
      occurrencesToday: occurrencesBetween(planning.source, today, today),
      meetings: meetings.data,
      alerts: alerts.data,
      anomalies: anomalies.data,
      checksToday: checks.data,
      actions: actions.data,
    });
  }, [
    planning.source,
    meetings.data,
    alerts.data,
    anomalies.data,
    actions.data,
    checks.data,
    today,
    now,
    settings.routineLateToleranceMinutes,
  ]);

  return (
    <QueryBoundary queries={[...planning.queries, meetings, alerts, anomalies, actions, checks]}>
      {() => (
        <>
          <ol className={styles.stages} aria-label="Étapes du processus de travail">
            {PROCESS_STAGES.map((stage, i) => (
              <li key={stage.key} className={styles.stage}>
                <h2 className={styles.stageTitle}>
                  <span className={styles.stageNumber}>{i + 1}</span>
                  {stage.title}
                </h2>
                <div className={styles.nodes}>
                  {stage.nodes
                    .filter((node) => !node.module || modules.isEnabled(node.module))
                    .map((node) => {
                      const to = linkFor(node, can, modules.pathEnabled);
                      const body = (
                        <>
                          <span className={styles.nodeTitle}>{node.title}</span>
                          <span className={styles.nodeText}>{node.description}</span>
                          {node.metrics && metrics?.[node.metrics] && <Metrics list={metrics[node.metrics]!} />}
                        </>
                      );
                      return to ? (
                        <Link key={node.key} to={to} className={cx(styles.node, styles.nodeLink)}>
                          {body}
                        </Link>
                      ) : (
                        <div key={node.key} className={styles.node}>
                          {body}
                          <span className={styles.restricted}>Géré par un autre rôle</span>
                        </div>
                      );
                    })}
                </div>
                {i < PROCESS_STAGES.length - 1 && (
                  <span className={styles.arrow} aria-hidden>
                    <ArrowRight className={styles.arrowWide} size={18} />
                    <ArrowDown className={styles.arrowNarrow} size={18} />
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className={styles.loop}>
            <RotateCcw size={16} aria-hidden />
            Boucle d’amélioration : ce que révèlent le pilotage et les actions correctives fait évoluer les standards (étape 1).
          </p>
        </>
      )}
    </QueryBoundary>
  );
}

function Metrics({ list }: { list: Metric[] }) {
  return (
    <span className={styles.metrics}>
      {list.map((m) =>
        m.tone ? (
          <Badge key={m.label} tone={m.tone}>
            {m.value} {m.label}
          </Badge>
        ) : (
          <span key={m.label} className={styles.metric}>
            <strong>{m.value}</strong> {m.label}
          </span>
        ),
      )}
    </span>
  );
}

/* ---------- Flux de fabrication ---------- */

function FlowMap() {
  const { can } = useAuth();
  const orders = useCollection('productionOrders');
  const alerts = useCollection('andonAlerts');
  const stocks = useCollection('materialStocks');
  const anomalies = useCollection('anomalies');
  const { queries, lookups } = useLookups();

  const flows = useMemo<LineFlow[]>(
    () =>
      lookups && orders.data && alerts.data && stocks.data && anomalies.data
        ? productionFlow({
            lines: lookups.lines,
            workstations: lookups.workstations,
            orders: orders.data,
            alerts: alerts.data,
            stocks: stocks.data,
            anomalies: anomalies.data,
          })
        : [],
    [lookups, orders.data, alerts.data, stocks.data, anomalies.data],
  );
  const canSeePlant = can('space.supervision') && can('production.view');

  return (
    <QueryBoundary queries={[orders, alerts, stocks, anomalies, ...queries]}>
      {() =>
        flows.length === 0 ? (
          <EmptyState title="Aucun poste actif" description="Les postes se déclarent dans Administration › Postes et QR codes." />
        ) : (
          <div className={styles.lines}>
            {flows.map(({ line, stations }) => (
              <section key={line.id} className={styles.line} aria-labelledby={`line-${line.id}`}>
                <h2 id={`line-${line.id}`} className={styles.lineTitle}>
                  {line.name}
                  {line.description && <span className={styles.lineDescription}> — {line.description}</span>}
                </h2>
                <ol className={styles.flow}>
                  {stations.map((s, i) => {
                    const state = STATION_STATE[s.view.state];
                    return (
                      <li key={s.station.id} className={styles.step}>
                        <div className={cx(styles.station, styles[s.view.state])}>
                          <span className={styles.stationStage}>{s.stage ? stageLabel(s.stage) : s.station.process}</span>
                          <span className={styles.stationName}>
                            {s.station.code} · {s.station.name}
                          </span>
                          <Badge tone={state.tone}>{state.label}</Badge>
                          <span className={styles.stationOrders}>
                            {s.ordersHere === 0 ? 'Aucun OF en cours' : `${s.ordersHere} OF en cours`}
                            {s.blockedHere > 0 && <strong className={styles.blocked}> · {s.blockedHere} bloqué(s)</strong>}
                          </span>
                        </div>
                        {i < stations.length - 1 && (
                          <span className={styles.arrow} aria-hidden>
                            <ArrowRight className={styles.arrowWide} size={18} />
                            <ArrowDown className={styles.arrowNarrow} size={18} />
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
            {canSeePlant && (
              <p className={styles.note}>
                Emplacement physique des postes et détail des signaux : <Link to="/manager/atelier">plan de l’atelier</Link>.
              </p>
            )}
          </div>
        )
      }
    </QueryBoundary>
  );
}

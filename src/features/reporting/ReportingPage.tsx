import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Download } from 'lucide-react';
import { BarChart, LineChart, RankedBars } from '@/components/data-display/Charts';
import { QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Kpi, KpiStrip } from '@/components/ui/Kpi';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { ANOMALY_CATEGORY } from '@/features/shared/labels';
import { useLookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { formatMinutes, formatShortDate, todayKey } from '@/utils/date';
import { formatPercent } from '@/utils/format';
import { PeriodSelector } from './PeriodSelector';
import {
  anomaliesByCategory,
  anomaliesByWorkstation,
  computeKpis,
  coverage,
  dailySeries,
  delta,
  previousPeriod,
  resolvePeriod,
  toCsv,
  type PeriodPreset,
  type ReportSource,
} from './model';
import styles from './ReportingPage.module.css';

export function ReportingPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const today = todayKey();
  const preset = (params.get('periode') as PeriodPreset | null) ?? '7d';
  const lineId = params.get('ligne') ?? '';
  const period = resolvePeriod(preset, today, { from: params.get('du'), to: params.get('au') });
  const previous = previousPeriod(period);

  const templates = useCollection('routineTemplates');
  const runs = useCollection('routineRuns');
  const anomalies = useCollection('anomalies');
  const actions = useCollection('actions');
  const alerts = useCollection('andonAlerts');
  const checks = useCollection('qualityChecks');
  const { queries, lookups } = useLookups();
  const all = [templates, runs, anomalies, actions, alerts, checks, ...queries];

  const source = useMemo<ReportSource | null>(
    () =>
      templates.data && runs.data && anomalies.data && actions.data && alerts.data && checks.data && lookups
        ? {
            templates: templates.data,
            runs: runs.data,
            anomalies: anomalies.data,
            actions: actions.data,
            alerts: alerts.data,
            checks: checks.data,
            workstations: lookups.workstations,
          }
        : null,
    [templates.data, runs.data, anomalies.data, actions.data, alerts.data, checks.data, lookups],
  );

  const report = useMemo(() => {
    if (!source) return null;
    const dims = { lineId: lineId || undefined };
    return {
      kpis: computeKpis(source, period, dims),
      prev: computeKpis(source, previous, dims),
      daily: dailySeries(source, period, dims),
      prevDaily: dailySeries(source, previous, dims),
      byCategory: anomaliesByCategory(source, period, dims),
      byStation: anomaliesByWorkstation(source, period, dims),
      comparable: coverage(source, previous) > 0,
    };
  }, [source, period.from, period.to, previous.from, previous.to, lineId]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next: Record<string, string | undefined>) => {
    const merged = {
      periode: preset,
      ligne: lineId || undefined,
      du: params.get('du') ?? undefined,
      au: params.get('au') ?? undefined,
      ...next,
    };
    setParams(Object.fromEntries(Object.entries(merged).filter(([, v]) => v)) as Record<string, string>, { replace: true });
  };

  const exportCsv = () => {
    if (!report) return;
    const blob = new Blob(['﻿' + toCsv(report.daily)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `indicateurs_${period.from}_${period.to}${lineId ? `_${lookups?.lineById.get(lineId)?.code ?? ''}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export CSV téléchargé.');
  };

  const label = (d: string) => formatShortDate(d);

  return (
    <>
      <PageHeader
        title="Reporting"
        description="Indicateurs calculés à partir des enregistrements de la période, comparés à la période précédente de même durée."
        actions={
          <Button icon={<Download size={16} aria-hidden />} onClick={exportCsv} disabled={!report}>
            Exporter (CSV)
          </Button>
        }
      />
      <Stack>
        <div className={styles.filters}>
          <PeriodSelector
            key={preset}
            preset={preset}
            from={params.get('du')}
            to={params.get('au')}
            max={today}
            onChange={({ preset: p, from, to }) =>
              update({ periode: p, du: p === 'custom' ? from : undefined, au: p === 'custom' ? to : undefined })
            }
          />
          {lookups && (
            <Tabs
              variant="segmented"
              label="Ligne"
              value={lineId || 'all'}
              onChange={(v) => update({ ligne: v === 'all' ? undefined : v })}
              items={[{ value: 'all', label: 'Tout l’atelier' }, ...lookups.lines.map((l) => ({ value: l.id, label: l.name }))]}
            />
          )}
        </div>
        <p className={styles.periodLabel}>
          <strong>{period.label}</strong> · comparé au {formatShortDate(previous.from)} – {formatShortDate(previous.to)}
          {lineId && ' · les routines et actions restent au périmètre atelier'}
        </p>

        <QueryBoundary queries={all}>
          {() => {
            if (!report) return null;
            const { kpis, comparable } = report;
            const prev = comparable ? report.prev : null;
            const d = (cur: number | null, key: keyof typeof kpis, higher: boolean, unit?: 'pts') =>
              prev ? delta(cur, prev[key] as number | null, higher, unit) : undefined;
            const compare = <T,>(series: T[]) => (comparable ? series : undefined);
            return (
              <>
                {!comparable && (
                  <p className={styles.muted} role="note">
                    Aucune donnée sur la période précédente : pas de comparaison affichée.
                  </p>
                )}
                <KpiStrip>
                  <Kpi
                    label="Routines réalisées"
                    value={formatPercent(kpis.routinePct)}
                    detail="points traités / prévus"
                    delta={d(kpis.routinePct, 'routinePct', true, 'pts')}
                  />
                  <Kpi
                    label="Anomalies déclarées"
                    value={kpis.anomalies}
                    detail={`${kpis.criticalAnomalies} critique(s)`}
                    delta={d(kpis.anomalies, 'anomalies', false)}
                  />
                  <Kpi
                    label="Actions terminées"
                    value={kpis.actionsClosed}
                    detail={`${kpis.actionsCreated} créées`}
                    delta={d(kpis.actionsClosed, 'actionsClosed', true)}
                  />
                  <Kpi
                    label="Délai moyen de clôture"
                    value={kpis.avgClosureDays === null ? '—' : `${kpis.avgClosureDays.toFixed(1).replace('.', ',')} j`}
                    delta={d(kpis.avgClosureDays, 'avgClosureDays', false)}
                  />
                  <Kpi
                    label="En retard en fin de période"
                    value={kpis.overdueAtEnd}
                    tone={kpis.overdueAtEnd ? 'danger' : 'neutral'}
                    delta={d(kpis.overdueAtEnd, 'overdueAtEnd', false)}
                  />
                </KpiStrip>
                <KpiStrip>
                  <Kpi label="Andon déclenchés" value={kpis.andonCount} delta={d(kpis.andonCount, 'andonCount', false)} />
                  <Kpi
                    label="Prise en charge Andon"
                    value={kpis.andonAvgAckMin === null ? '—' : formatMinutes(kpis.andonAvgAckMin)}
                    detail="moyenne"
                    delta={d(kpis.andonAvgAckMin, 'andonAvgAckMin', false)}
                  />
                  <Kpi
                    label="Résolution Andon"
                    value={kpis.andonAvgResMin === null ? '—' : formatMinutes(kpis.andonAvgResMin)}
                    detail="moyenne"
                    delta={d(kpis.andonAvgResMin, 'andonAvgResMin', false)}
                  />
                  <Kpi
                    label="Conformité LQC"
                    value={formatPercent(kpis.qualityPct, 1)}
                    detail={`${kpis.qualityCount} mesures`}
                    delta={d(kpis.qualityPct, 'qualityPct', true, 'pts')}
                  />
                </KpiStrip>

                <Columns ratio="equal">
                  <Panel title="Réalisation des routines par jour">
                    <LineChart
                      title="Réalisation des routines par jour"
                      data={report.daily.map((d) => ({ label: label(d.date), value: d.routinePct }))}
                      compare={compare(report.prevDaily.map((x) => ({ label: label(x.date), value: x.routinePct })))}
                      format={(v) => `${Math.round(v)} %`}
                      max={100}
                    />
                  </Panel>
                  <Panel title="Anomalies déclarées par jour">
                    <BarChart
                      title="Anomalies déclarées par jour"
                      data={report.daily.map((d) => ({ label: label(d.date), value: d.anomalies }))}
                      compare={compare(report.prevDaily.map((x) => ({ label: label(x.date), value: x.anomalies })))}
                    />
                  </Panel>
                  <Panel title="Anomalies par catégorie">
                    {report.byCategory.length ? (
                      <RankedBars
                        title="Anomalies par catégorie"
                        items={report.byCategory.map(([c, n]) => ({ label: ANOMALY_CATEGORY[c], value: n }))}
                      />
                    ) : (
                      <p className={styles.muted}>Aucune anomalie sur la période.</p>
                    )}
                  </Panel>
                  <Panel title="Postes les plus concernés">
                    {report.byStation.length ? (
                      <RankedBars
                        title="Anomalies par poste"
                        tone="warning"
                        items={report.byStation.slice(0, 8).map(([id, n]) => ({ label: lookups!.workstationName(id), value: n }))}
                      />
                    ) : (
                      <p className={styles.muted}>Aucune anomalie rattachée à un poste.</p>
                    )}
                  </Panel>
                  <Panel title="Andon déclenchés par jour">
                    <BarChart
                      title="Andon par jour"
                      data={report.daily.map((d) => ({ label: label(d.date), value: d.andon }))}
                      compare={compare(report.prevDaily.map((x) => ({ label: label(x.date), value: x.andon })))}
                    />
                  </Panel>
                  <Panel title="Conformité LQC par jour">
                    <LineChart
                      title="Conformité LQC par jour"
                      data={report.daily.map((d) => ({ label: label(d.date), value: d.qualityPct }))}
                      format={(v) => `${Math.round(v)} %`}
                      max={100}
                      min={80}
                      reference={{ value: 95, label: 'Objectif 95 %' }}
                    />
                  </Panel>
                </Columns>
              </>
            );
          }}
        </QueryBoundary>
      </Stack>
    </>
  );
}

import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Download } from 'lucide-react';
import { BarChart, LineChart, RankedBars } from '@/components/data-display/Charts';
import { DataTable } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { Columns, PageHeader, Stack } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Kpi, KpiStrip } from '@/components/ui/Kpi';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/Toast';
import { ANOMALY_CATEGORY } from '@/features/shared/labels';
import { DEFINITIONS } from '@/features/shared/definitions';
import { useLookups, useSettings } from '@/features/shared/api';
import { usePlanningData } from '@/features/planning/api';
import { useCollection } from '@/hooks/useData';
import { dayRange, formatMinutes, formatShortDate, todayKey } from '@/utils/date';
import { formatPercent } from '@/utils/format';
import { PeriodSelector } from './PeriodSelector';
import {
  anomaliesByCategory,
  anomaliesByWorkstation,
  computeKpis,
  coverage,
  dailySeries,
  delta,
  drilldown,
  previousPeriod,
  resolvePeriod,
  routinesByTemplate,
  toCsv,
  type Drilldown,
  type PeriodPreset,
  type ReportSource,
} from './model';
import { ReportingDrilldown } from './ReportingDrilldown';
import type { AnomalyCategory } from '@/types/domain';
import styles from './ReportingPage.module.css';

export function ReportingPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const today = todayKey();
  const { settings } = useSettings();
  const preset = (params.get('periode') as PeriodPreset | null) ?? '7d';
  const lineId = params.get('ligne') ?? '';
  const period = resolvePeriod(preset, today, { from: params.get('du'), to: params.get('au') });
  const selection: Drilldown | null = params.get('jour')
    ? { kind: 'day', date: params.get('jour')! }
    : params.get('categorie')
      ? { kind: 'category', category: params.get('categorie') as AnomalyCategory }
      : params.get('poste')
        ? { kind: 'station', workstationId: params.get('poste')! }
        : params.get('routine')
          ? { kind: 'routine', routineId: params.get('routine')! }
          : null;
  const previous = previousPeriod(period);

  // Période affichée et période de comparaison
  const planning = usePlanningData({ from: previous.from, to: period.to });
  const anomalies = useCollection('anomalies');
  const actions = useCollection('actions');
  const alerts = useCollection('andonAlerts');
  const checks = useCollection('qualityChecks', { range: { field: 'createdAt', ...dayRange(previous.from, period.to) } });
  const { queries, lookups } = useLookups();
  const all = [...planning.queries, anomalies, actions, alerts, checks, ...queries];

  const source = useMemo<ReportSource | null>(
    () =>
      planning.source && anomalies.data && actions.data && alerts.data && checks.data && lookups
        ? {
            ...planning.source,
            anomalies: anomalies.data,
            actions: actions.data,
            alerts: alerts.data,
            checks: checks.data,
            workstations: lookups.workstations,
          }
        : null,
    [planning.source, anomalies.data, actions.data, alerts.data, checks.data, lookups],
  );

  const selectionKey = JSON.stringify(selection);
  const report = useMemo(() => {
    if (!source) return null;
    const dims = { lineId: lineId || undefined };
    const opts = { toleranceMin: settings.routineLateToleranceMinutes, now: new Date() };
    return {
      kpis: computeKpis(source, period, dims, opts),
      prev: computeKpis(source, previous, dims, opts),
      daily: dailySeries(source, period, dims, opts),
      prevDaily: dailySeries(source, previous, dims, opts),
      byRoutine: routinesByTemplate(source, period, dims, opts),
      byCategory: anomaliesByCategory(source, period, dims),
      byStation: anomaliesByWorkstation(source, period, dims),
      comparable: coverage(source, previous) > 0,
      detail: selection ? drilldown(source, period, selection, dims, opts) : null,
    };
  }, [source, period.from, period.to, previous.from, previous.to, lineId, settings.routineLateToleranceMinutes, selectionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next: Record<string, string | undefined>) => {
    const merged = {
      periode: preset,
      ligne: lineId || undefined,
      du: params.get('du') ?? undefined,
      au: params.get('au') ?? undefined,
      jour: params.get('jour') ?? undefined,
      categorie: params.get('categorie') ?? undefined,
      poste: params.get('poste') ?? undefined,
      routine: params.get('routine') ?? undefined,
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
  /** Une seule sélection à la fois ; re-cliquer la même la retire. */
  const select = (key: 'jour' | 'categorie' | 'poste' | 'routine', value: string) =>
    update({
      jour: undefined,
      categorie: undefined,
      poste: undefined,
      routine: undefined,
      [key]: params.get(key) === value ? undefined : value,
    });
  const clearSelection = () => update({ jour: undefined, categorie: undefined, poste: undefined, routine: undefined });

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
              update({
                periode: p,
                du: p === 'custom' ? from : undefined,
                au: p === 'custom' ? to : undefined,
                jour: undefined,
                routine: undefined,
              })
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
          {lineId && ' · les actions restent au périmètre atelier'}
        </p>

        <QueryBoundary queries={all}>
          {() => {
            if (!report) return null;
            const { kpis, comparable } = report;
            const prev = comparable ? report.prev : null;
            const d = (cur: number | null, key: keyof typeof kpis, higher: boolean, unit?: 'pts') =>
              prev ? delta(cur, prev[key] as number | null, higher, unit) : undefined;
            const compare = <T,>(series: T[]) => (comparable ? series : undefined);
            const dayIndex = selection?.kind === 'day' ? report.daily.findIndex((x) => x.date === selection.date) : null;
            const drill = selection && report.detail && (
              <ReportingDrilldown
                selection={selection}
                result={report.detail}
                lookups={lookups!}
                routineTitle={
                  selection.kind === 'routine'
                    ? report.byRoutine.find((r) => r.routine.id === selection.routineId)?.routine.title
                    : undefined
                }
                periodLabel={period.label}
                onClose={clearSelection}
              />
            );
            return (
              <>
                {!comparable && (
                  <p className={styles.muted} role="note">
                    Aucune donnée sur la période précédente : pas de comparaison affichée.
                  </p>
                )}
                <KpiStrip>
                  <Kpi
                    label="Routines programmées"
                    value={kpis.routinesPlanned}
                    detail={`${kpis.routinesPending} à venir ou à faire`}
                    to="/manager/routines"
                  />
                  <Kpi label="Terminées" value={kpis.routinesDone} tone="success" delta={d(kpis.routinesDone, 'routinesDone', true)} />
                  <Kpi label="En cours" value={kpis.routinesInProgress} />
                  <Kpi
                    label="En retard ou non réalisées"
                    to="/manager/routines?vue=retard"
                    value={kpis.routinesLate}
                    tone={kpis.routinesLate ? 'danger' : 'neutral'}
                    delta={d(kpis.routinesLate, 'routinesLate', false)}
                  />
                  <Kpi
                    label="Durée réelle moyenne"
                    definition={DEFINITIONS.routineDuration}
                    value={kpis.avgRoutineMin === null ? '—' : formatMinutes(kpis.avgRoutineMin)}
                    delta={d(kpis.avgRoutineMin, 'avgRoutineMin', false)}
                  />
                </KpiStrip>
                <KpiStrip>
                  <Kpi
                    label="Routines réalisées"
                    definition={DEFINITIONS.routinePct}
                    value={formatPercent(kpis.routinePct)}
                    detail="terminées / échues"
                    delta={d(kpis.routinePct, 'routinePct', true, 'pts')}
                  />
                  <Kpi
                    label="Routines à l’heure"
                    definition={DEFINITIONS.routineOnTime}
                    value={formatPercent(kpis.onTimePct)}
                    detail={`tolérance ${settings.routineLateToleranceMinutes} min`}
                    delta={d(kpis.onTimePct, 'onTimePct', true, 'pts')}
                  />
                  <Kpi
                    label="Anomalies déclarées"
                    to="/manager/anomalies"
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
                    definition={DEFINITIONS.closureDelay}
                    value={kpis.avgClosureDays === null ? '—' : `${kpis.avgClosureDays.toFixed(1).replace('.', ',')} j`}
                    delta={d(kpis.avgClosureDays, 'avgClosureDays', false)}
                  />
                  <Kpi
                    label="En retard en fin de période"
                    definition={DEFINITIONS.overdueAtEnd}
                    value={kpis.overdueAtEnd}
                    tone={kpis.overdueAtEnd ? 'danger' : 'neutral'}
                    delta={d(kpis.overdueAtEnd, 'overdueAtEnd', false)}
                  />
                </KpiStrip>
                <KpiStrip>
                  <Kpi
                    label="Andon déclenchés"
                    to="/andon?vue=historique"
                    value={kpis.andonCount}
                    delta={d(kpis.andonCount, 'andonCount', false)}
                  />
                  <Kpi
                    label="Prise en charge Andon"
                    definition={DEFINITIONS.andonAck}
                    value={kpis.andonAvgAckMin === null ? '—' : formatMinutes(kpis.andonAvgAckMin)}
                    detail="moyenne"
                    delta={d(kpis.andonAvgAckMin, 'andonAvgAckMin', false)}
                  />
                  <Kpi
                    label="Résolution Andon"
                    definition={DEFINITIONS.andonResolution}
                    value={kpis.andonAvgResMin === null ? '—' : formatMinutes(kpis.andonAvgResMin)}
                    detail="moyenne"
                    delta={d(kpis.andonAvgResMin, 'andonAvgResMin', false)}
                  />
                  <Kpi
                    label="Conformité LQC"
                    definition={DEFINITIONS.quality}
                    value={formatPercent(kpis.qualityPct, 1)}
                    detail={`${kpis.qualityCount} mesures`}
                    delta={d(kpis.qualityPct, 'qualityPct', true, 'pts')}
                  />
                </KpiStrip>

                <Panel title="Réalisation par routine" description="Cliquez une routine pour voir ses occurrences sur la période." flush>
                  <DataTable
                    caption="Réalisation par routine sur la période"
                    rows={report.byRoutine}
                    rowKey={(r) => r.routine.id}
                    onRowSelect={(r) => select('routine', r.routine.id)}
                    selectedKey={selection?.kind === 'routine' ? selection.routineId : null}
                    initialSort={{ id: 'pct', direction: 'asc' }}
                    columns={[
                      { id: 'title', header: 'Routine', mobile: 'title', cell: (r) => r.routine.title, sortValue: (r) => r.routine.title },
                      {
                        id: 'planned',
                        header: 'Programmées',
                        align: 'center',
                        mobile: 'meta',
                        cell: (r) => r.planned,
                        sortValue: (r) => r.planned,
                      },
                      { id: 'done', header: 'Terminées', align: 'center', mobile: 'meta', cell: (r) => r.done, sortValue: (r) => r.done },
                      {
                        id: 'late',
                        header: 'En retard / non réalisées',
                        align: 'center',
                        mobile: 'meta',
                        cell: (r) => r.late || '—',
                        sortValue: (r) => r.late,
                      },
                      {
                        id: 'pct',
                        header: 'Réalisation',
                        align: 'center',
                        mobile: 'aside',
                        cell: (r) => formatPercent(r.pct),
                        sortValue: (r) => r.pct ?? 2,
                      },
                      {
                        id: 'avg',
                        header: 'Durée moyenne',
                        align: 'center',
                        mobile: 'meta',
                        cell: (r) => (r.avgMin === null ? '—' : formatMinutes(r.avgMin)),
                        sortValue: (r) => r.avgMin ?? 0,
                      },
                    ]}
                    empty={{ title: 'Aucune routine planifiée sur la période.' }}
                  />
                </Panel>

                <p className={styles.muted}>
                  Survolez un graphique pour lire les valeurs ; cliquez un jour, une catégorie ou un poste pour afficher le détail.
                </p>
                <Columns ratio="equal">
                  <Panel title="Réalisation des routines par jour">
                    <LineChart
                      title="Réalisation des routines par jour"
                      data={report.daily.map((d) => ({ label: label(d.date), value: d.routinePct }))}
                      compare={compare(report.prevDaily.map((x) => ({ label: label(x.date), value: x.routinePct })))}
                      format={(v) => `${Math.round(v)} %`}
                      max={100}
                      selectedIndex={dayIndex}
                      onSelect={(i) => select('jour', report.daily[i]!.date)}
                    />
                  </Panel>
                  <Panel title="Anomalies déclarées par jour">
                    <BarChart
                      title="Anomalies déclarées par jour"
                      data={report.daily.map((d) => ({ label: label(d.date), value: d.anomalies }))}
                      compare={compare(report.prevDaily.map((x) => ({ label: label(x.date), value: x.anomalies })))}
                      unitLabel="anomalie(s)"
                      selectedIndex={dayIndex}
                      onSelect={(i) => select('jour', report.daily[i]!.date)}
                    />
                  </Panel>
                  <Panel title="Anomalies par catégorie">
                    {report.byCategory.length ? (
                      <RankedBars
                        title="Anomalies par catégorie"
                        items={report.byCategory.map(([c, n]) => ({ key: c, label: ANOMALY_CATEGORY[c], value: n }))}
                        onSelect={(key) => select('categorie', key)}
                        selected={selection?.kind === 'category' ? selection.category : null}
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
                        items={report.byStation.slice(0, 8).map(([id, n]) => ({ key: id, label: lookups!.workstationName(id), value: n }))}
                        onSelect={(key) => select('poste', key)}
                        selected={selection?.kind === 'station' ? selection.workstationId : null}
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
                      unitLabel="Andon"
                      selectedIndex={dayIndex}
                      onSelect={(i) => select('jour', report.daily[i]!.date)}
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
                      selectedIndex={dayIndex}
                      onSelect={(i) => select('jour', report.daily[i]!.date)}
                    />
                  </Panel>
                </Columns>
                {drill}
              </>
            );
          }}
        </QueryBoundary>
      </Stack>
    </>
  );
}

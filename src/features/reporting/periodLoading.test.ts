import { describe, expect, it } from 'vitest';
import { buildDemoData } from '@/data/demo/seed';
import { countOccurrences, occurrencesBetween, type OccurrenceSource } from '@/features/planning/model';
import { createMemoryStore, createStoreDataSource } from '@/services/data/storeDataSource';
import type { Dataset } from '@/services/data/types';
import { addDays, dayRange, toDateKey } from '@/utils/date';
import {
  anomaliesByCategory,
  anomaliesByWorkstation,
  computeKpis,
  coverage,
  dailySeries,
  drilldown,
  previousPeriod,
  resolvePeriod,
  routinesByTemplate,
  type PeriodPreset,
  type ReportSource,
} from './model';

/* Chargement par période : chaque écran doit calculer EXACTEMENT les mêmes résultats avec les seules données
   de sa plage qu'avec tout l'historique. Les filtres sont appliqués par la vraie source de données (démo locale),
   avec les mêmes paramètres que les écrans. */

const NOW = new Date(2026, 8, 29, 10, 0, 0);
const TODAY = toDateKey(NOW);
const OPTS = { toleranceMin: 15, now: NOW };

async function sources(data: Dataset, runsFrom: string, runsTo: string, checksFrom: string, checksTo: string) {
  const ds = createStoreDataSource(createMemoryStore(), () => data);
  const windowedRuns = await ds.repo('routineRuns').list({ range: { field: 'date', gte: runsFrom, lt: addDays(runsTo, 1) } });
  const windowedChecks = await ds.repo('qualityChecks').list({ range: { field: 'createdAt', ...dayRange(checksFrom, checksTo) } });
  const base = {
    schedules: data.schedules,
    routines: data.routineTemplates,
    anomalies: data.anomalies,
    actions: data.actions,
    alerts: data.andonAlerts,
    workstations: data.workstations,
  };
  const full: ReportSource = { ...base, runs: data.routineRuns, checks: data.qualityChecks };
  const windowed: ReportSource = { ...base, runs: windowedRuns, checks: windowedChecks };
  return { full, windowed, loaded: { runs: windowedRuns.length, checks: windowedChecks.length } };
}

describe('Reporting : mêmes résultats avec la période chargée qu’avec tout l’historique', () => {
  const data = buildDemoData(NOW);

  it.each<PeriodPreset>(['7d', '30d', 'month'])(
    'période « %s »',
    async (preset) => {
      const period = resolvePeriod(preset, TODAY);
      const previous = previousPeriod(period);
      const { full, windowed, loaded } = await sources(data, previous.from, period.to, previous.from, period.to);
      for (const [p, dims] of [
        [period, {}],
        [previous, {}],
        [period, { lineId: 'line-a' }],
      ] as const) {
        expect(computeKpis(windowed, p, dims, OPTS)).toEqual(computeKpis(full, p, dims, OPTS));
        expect(dailySeries(windowed, p, dims, OPTS)).toEqual(dailySeries(full, p, dims, OPTS));
        expect(routinesByTemplate(windowed, p, dims, OPTS)).toEqual(routinesByTemplate(full, p, dims, OPTS));
        expect(anomaliesByCategory(windowed, p, dims)).toEqual(anomaliesByCategory(full, p, dims));
        expect(anomaliesByWorkstation(windowed, p, dims)).toEqual(anomaliesByWorkstation(full, p, dims));
      }
      expect(coverage(windowed, previous) > 0).toBe(coverage(full, previous) > 0);
      const day = addDays(TODAY, -2);
      const routineId = data.routineTemplates[0]!.id;
      for (const selection of [
        { kind: 'day', date: day },
        { kind: 'routine', routineId },
      ] as const) {
        expect(drilldown(windowed, period, selection, {}, OPTS)).toEqual(drilldown(full, period, selection, {}, OPTS));
      }
      // La plage charge bien moins que l'historique quand la période est courte
      if (preset === '7d') expect(loaded.runs).toBeLessThan(data.routineRuns.length);
    },
    120_000,
  ); // chaque indicateur est calculé deux fois (complet et par période) sur jusqu'à 60 jours
});

describe('Écrans de routines : mêmes occurrences avec la plage chargée', () => {
  const data = buildDemoData(NOW);
  const ranges: [string, string, string][] = [
    ['aujourd’hui (tableaux de bord, menu, espace personnel)', TODAY, TODAY],
    ['7 derniers jours (administration)', addDays(TODAY, -6), TODAY],
    ['± 7 jours (Mes routines)', addDays(TODAY, -7), addDays(TODAY, 7)],
    ['un jour passé (suivi, exécution)', addDays(TODAY, -10), addDays(TODAY, -10)],
    ['une semaine (planification, planning)', '2026-09-21', '2026-09-27'],
  ];

  it.each(ranges)('%s', async (_label, from, to) => {
    const { full, windowed } = await sources(data, from, to, from, to);
    const fullOcc = occurrencesBetween(full as OccurrenceSource, from, to);
    const winOcc = occurrencesBetween(windowed as OccurrenceSource, from, to);
    expect(winOcc).toEqual(fullOcc);
    expect(countOccurrences(winOcc, TODAY, NOW, 15)).toEqual(countOccurrences(fullOcc, TODAY, NOW, 15));
    expect(winOcc.some((o) => o.run)).toBe(fullOcc.some((o) => o.run));
  });
});

import { useMemo, useState } from 'react';
import { RankedBars } from '@/components/data-display/Charts';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { Columns, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Kpi, KpiStrip } from '@/components/ui/Kpi';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import type { Lookups } from '@/features/shared/api';
import type { AndonAlert, AndonType } from '@/types/domain';
import { addDays, dateKeyOf, formatDateTime, formatMinutes, todayKey } from '@/utils/date';
import { ANDON_STATUS, ANDON_TYPE, acknowledgeMinutes, andonStats, resolutionMinutes } from '../model';

const PERIODS = [
  { value: '7', label: '7 jours' },
  { value: '30', label: '30 jours' },
  { value: '90', label: '90 jours' },
] as const;

export function AndonHistory({ alerts, lookups }: { alerts: AndonAlert[]; lookups: Lookups }) {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const from = addDays(todayKey(), -(Number(days) - 1));

  const inPeriod = useMemo(() => alerts.filter((a) => dateKeyOf(a.raisedAt) >= from), [alerts, from]);
  const stats = andonStats(inPeriod);
  const byType = (Object.keys(ANDON_TYPE) as AndonType[])
    .map((t) => ({ label: ANDON_TYPE[t].label, value: inPeriod.filter((a) => a.type === t).length }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);
  const byStation = lookups.workstations
    .map((w) => ({ label: `${w.code} — ${w.process}`, value: inPeriod.filter((a) => a.workstationId === w.id).length }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value);

  const columns: Column<AndonAlert>[] = [
    {
      id: 'raised',
      header: 'Déclenché le',
      mobile: 'meta',
      cell: (a) => <span style={{ whiteSpace: 'nowrap' }}>{formatDateTime(a.raisedAt)}</span>,
      sortValue: (a) => a.raisedAt,
    },
    {
      id: 'station',
      header: 'Poste',
      mobile: 'title',
      cell: (a) => lookups.workstationName(a.workstationId),
      sortValue: (a) => lookups.workstationById.get(a.workstationId)?.code ?? '',
    },
    { id: 'type', header: 'Type', mobile: 'meta', cell: (a) => ANDON_TYPE[a.type].label, sortValue: (a) => a.type },
    { id: 'detail', header: 'Problème', mobile: 'meta', cell: (a) => a.detail },
    {
      id: 'ack',
      header: 'Prise en charge',
      align: 'right',
      mobile: 'meta',
      cell: (a) => (acknowledgeMinutes(a) === null ? '—' : formatMinutes(acknowledgeMinutes(a)!)),
      sortValue: (a) => acknowledgeMinutes(a) ?? -1,
    },
    {
      id: 'res',
      header: 'Résolution',
      align: 'right',
      mobile: 'meta',
      cell: (a) => (resolutionMinutes(a) === null ? '—' : formatMinutes(resolutionMinutes(a)!)),
      sortValue: (a) => resolutionMinutes(a) ?? -1,
    },
    { id: 'cause', header: 'Cause', mobile: 'hidden', cell: (a) => a.rootCause ?? '—' },
    {
      id: 'status',
      header: 'Statut',
      mobile: 'aside',
      cell: (a) => <Badge tone={ANDON_STATUS[a.status].tone}>{ANDON_STATUS[a.status].label}</Badge>,
      sortValue: (a) => a.status,
    },
  ];

  return (
    <Stack>
      <Tabs variant="segmented" label="Période" value={days} onChange={setDays} items={PERIODS.map((p) => ({ ...p }))} />
      <KpiStrip>
        <Kpi label="Andon déclenchés" value={stats.count} detail={`sur ${days} jours`} />
        <Kpi
          label="Prise en charge moyenne"
          value={stats.avgAcknowledgeMin === null ? '—' : formatMinutes(stats.avgAcknowledgeMin)}
          detail="déclenchement → prise en charge"
        />
        <Kpi
          label="Résolution moyenne"
          value={stats.avgResolutionMin === null ? '—' : formatMinutes(stats.avgResolutionMin)}
          detail="déclenchement → résolution"
        />
      </KpiStrip>
      <Columns ratio="equal">
        <Panel title="Répartition par type">
          {byType.length ? <RankedBars title="Andon par type" items={byType} tone="danger" /> : <p>Aucun Andon sur la période.</p>}
        </Panel>
        <Panel title="Répartition par poste">
          {byStation.length ? <RankedBars title="Andon par poste" items={byStation} /> : <p>Aucun Andon sur la période.</p>}
        </Panel>
      </Columns>
      <Panel title="Historique" flush>
        <DataTable
          caption="Historique des Andon"
          rows={inPeriod}
          columns={columns}
          rowKey={(a) => a.id}
          initialSort={{ id: 'raised', direction: 'desc' }}
          search={{
            placeholder: 'Rechercher un problème, une cause…',
            text: (a) => `${a.detail} ${a.rootCause ?? ''} ${lookups.workstationName(a.workstationId)}`,
          }}
          pageSize={20}
          empty={{ title: 'Aucun Andon sur la période.' }}
        />
      </Panel>
    </Stack>
  );
}

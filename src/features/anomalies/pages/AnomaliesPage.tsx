import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Camera, Plus } from 'lucide-react';
import { Can } from '@/app/providers/AuthProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { Tabs } from '@/components/ui/Tabs';
import { ANOMALY_CATEGORY, ANOMALY_STATUS, SEVERITY, options } from '@/features/shared/labels';
import { useLookups, workstationOptions } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import type { Anomaly, AnomalyCategory } from '@/types/domain';
import { formatDateTime } from '@/utils/date';
import { isOpenAnomaly, sortAnomalies } from '../model';

type View = 'open' | 'closed' | 'all';

export function AnomaliesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = (params.get('vue') as View | null) ?? 'open';
  const [category, setCategory] = useState<AnomalyCategory | ''>('');
  const [workstation, setWorkstation] = useState('');
  const anomalies = useCollection('anomalies');
  const actions = useCollection('actions');
  const { queries, lookups } = useLookups();

  const actionCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of actions.data ?? []) if (a.source.type === 'anomaly' && a.source.id) map.set(a.source.id, (map.get(a.source.id) ?? 0) + 1);
    return map;
  }, [actions.data]);

  const all = useMemo(() => anomalies.data ?? [], [anomalies.data]);
  const counts = { open: all.filter(isOpenAnomaly).length, closed: all.filter((a) => !isOpenAnomaly(a)).length, all: all.length };
  const rows = useMemo(
    () =>
      sortAnomalies(
        all.filter(
          (a) =>
            (view === 'all' || (view === 'open' ? isOpenAnomaly(a) : !isOpenAnomaly(a))) &&
            (!category || a.category === category) &&
            (!workstation || a.workstationId === workstation),
        ),
      ),
    [all, view, category, workstation],
  );

  const columns: Column<Anomaly>[] = [
    { id: 'date', header: 'Déclarée le', mobile: 'meta', width: '150px', cell: (a) => <span style={{ whiteSpace: 'nowrap' }}>{formatDateTime(a.createdAt)}</span>, sortValue: (a) => a.createdAt },
    { id: 'description', header: 'Description', mobile: 'title', cell: (a) => <span>{a.photo && <Camera size={14} aria-label="Photo jointe" style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />}{a.description}</span>, sortValue: (a) => a.description },
    { id: 'category', header: 'Catégorie', mobile: 'meta', cell: (a) => ANOMALY_CATEGORY[a.category], sortValue: (a) => ANOMALY_CATEGORY[a.category] },
    { id: 'ws', header: 'Poste', mobile: 'meta', cell: (a) => (a.workstationId ? lookups?.workstationById.get(a.workstationId)?.code ?? '—' : '—'), sortValue: (a) => lookups?.workstationById.get(a.workstationId ?? '')?.code ?? '' },
    { id: 'severity', header: 'Gravité', mobile: 'meta', cell: (a) => <Badge tone={SEVERITY[a.severity].tone}>{SEVERITY[a.severity].label}</Badge>, sortValue: (a) => SEVERITY[a.severity].rank },
    { id: 'actions', header: 'Actions', align: 'center', mobile: 'meta', cell: (a) => actionCount.get(a.id) ?? 0, sortValue: (a) => actionCount.get(a.id) ?? 0 },
    { id: 'status', header: 'Statut', mobile: 'aside', cell: (a) => <Badge tone={ANOMALY_STATUS[a.status].tone}>{ANOMALY_STATUS[a.status].label}</Badge>, sortValue: (a) => a.status },
  ];

  return (
    <>
      <PageHeader
        title="Anomalies"
        description="Écarts et incidents constatés sur le terrain, avec leurs actions correctives."
        actions={
          <Can permission="anomaly.create">
            <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => navigate('/signaler')}>Signaler une anomalie</Button>
          </Can>
        }
      />
      <QueryBoundary queries={[anomalies, actions, ...queries]}>
        {() => (
          <Panel flush>
            <div style={{ padding: '0 var(--space-4)' }}>
              <Tabs
                label="Filtrer par statut"
                value={view}
                onChange={(v) => setParams(v === 'open' ? {} : { vue: v }, { replace: true })}
                items={[
                  { value: 'open', label: 'Ouvertes', count: counts.open },
                  { value: 'closed', label: 'Clôturées', count: counts.closed },
                  { value: 'all', label: 'Toutes', count: counts.all },
                ]}
              />
            </div>
            <DataTable
              caption="Anomalies"
              rows={rows}
              columns={columns}
              rowKey={(a) => a.id}
              rowLink={(a) => `/anomalies/${a.id}`}
              rowTone={(a) => (isOpenAnomaly(a) && a.severity === 'critical' ? 'danger' : undefined)}
              search={{ placeholder: 'Rechercher dans les descriptions…', text: (a) => `${a.description} ${ANOMALY_CATEGORY[a.category]} ${lookups?.workstationName(a.workstationId)}` }}
              toolbar={
                <>
                  <div style={{ minWidth: 170 }}>
                    <SelectField label="Catégorie" hideLabel placeholder="Toutes catégories" options={options(ANOMALY_CATEGORY)} value={category} onChange={(e) => setCategory(e.target.value as AnomalyCategory | '')} />
                  </div>
                  <div style={{ minWidth: 200 }}>
                    <SelectField label="Poste" hideLabel placeholder="Tous les postes" options={workstationOptions(lookups?.workstations ?? [])} value={workstation} onChange={(e) => setWorkstation(e.target.value)} />
                  </div>
                </>
              }
              empty={{ title: view === 'open' ? 'Aucune anomalie ouverte.' : 'Aucune anomalie dans cette vue.' }}
            />
          </Panel>
        )}
      </QueryBoundary>
    </>
  );
}
